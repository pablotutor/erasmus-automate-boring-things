import uuid
from typing import Optional

from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import pdfplumber
import io

from scraper import scrape, SUPERMARKET_URLS

from graph.graph import graph
from db.queries import (
    get_all_meals, create_meal, delete_meal,
    get_pantry, update_pantry,
    save_deals, get_deals, clear_deals,
)

app = FastAPI(title="Meal Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ──────────────────────────────────────────────────────────

_VALID_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

class GenerateRequest(BaseModel):
    budget: float = Field(default=50.0, ge=10, le=500, description="Presupuesto semanal en euros")
    calistenia_days: list[str] = Field(default=[], description="Días de calistenia")
    running_days: list[str] = Field(default=[], description="Días de running")
    football_days: list[str] = Field(default=[], description="Días de fútbol")
    travel_days: list[str] = Field(default=[], description="Días fuera de casa")
    notes: Optional[str] = Field(default=None, max_length=300, description="Notas adicionales")

    @field_validator("calistenia_days", "running_days", "football_days", "travel_days")
    @classmethod
    def validate_days(cls, v: list[str]) -> list[str]:
        invalid = set(v) - _VALID_DAYS
        if invalid:
            raise ValueError(f"Días inválidos: {invalid}. Valores válidos: {_VALID_DAYS}")
        return list(set(v))  # deduplicar

    @field_validator("travel_days")
    @classmethod
    def validate_no_overlap(cls, travel: list[str], info) -> list[str]:
        sport_days = set(
            info.data.get("calistenia_days", []) +
            info.data.get("running_days", []) +
            info.data.get("football_days", [])
        )
        overlap = set(travel) & sport_days
        if overlap:
            raise ValueError(f"Un día no puede ser de viaje y de deporte a la vez: {overlap}")
        return travel

class PantryResponse(BaseModel):
    thread_id: str
    pantry_raw: str

class MealCreate(BaseModel):
    name: str
    meal_type: str
    ingredients: list[str]
    tags: list[str]
    prep_time: Optional[int] = None


# ── Graph endpoints ──────────────────────────────────────────────────────────

@app.post("/api/generate/start")
async def start_generation(req: GenerateRequest):
    """Inicia el grafo hasta el interrupt de ask_pantry."""
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    gym_days = list(set(req.calistenia_days + req.running_days + req.football_days))

    initial_state = {
        "raw_input": req.notes or "",
        "budget": req.budget,
        "context": {
            "gym_days": gym_days,
            "travel_days": req.travel_days,
            "calistenia_days": req.calistenia_days,
            "running_days": req.running_days,
            "football_days": req.football_days,
            "notes": req.notes or "",
        },
        "deals_text": get_deals(),
    }

    await graph.ainvoke(initial_state, config)

    return {
        "thread_id": thread_id,
        "question": "¿Qué tienes en casa esta semana? Escríbelo como quieras.",
    }


@app.post("/api/generate/resume")
async def resume_generation(req: PantryResponse):
    """Reanuda el grafo con la respuesta de despensa y devuelve el output final."""
    config = {"configurable": {"thread_id": req.thread_id}}

    await graph.aupdate_state(
        config,
        {"pantry_raw": req.pantry_raw},
        as_node="ask_pantry",
    )

    result = await graph.ainvoke(None, config)
    return result["final_output"]


# ── Deals endpoints ──────────────────────────────────────────────────────────

@app.post("/api/deals/scrape/{supermarket}")
async def scrape_deals(supermarket: str):
    """Scraping automático para billa, hofer o penny."""
    if supermarket not in SUPERMARKET_URLS:
        raise HTTPException(status_code=400, detail=f"Supermercado no soportado para scraping: {supermarket}")
    try:
        raw_text = scrape(supermarket)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al scrapear {supermarket}: {e}")
    save_deals(supermarket=supermarket, raw_text=raw_text)
    product_count = len(raw_text.splitlines())
    return {"ok": True, "supermarket": supermarket, "products_found": product_count}


@app.post("/api/deals/upload-pdf/{supermarket}")
async def upload_pdf(supermarket: str, file: UploadFile = File(...)):
    """Extrae texto de un PDF de ofertas (penny o spar) y lo guarda como deals."""
    if supermarket not in ("penny", "spar"):
        raise HTTPException(status_code=400, detail="Solo penny y spar admiten PDF.")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF.")
    content = await file.read()
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        raw_text = "\n".join(pages_text).strip()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el PDF: {e}")
    if not raw_text:
        raise HTTPException(status_code=422, detail="El PDF no contiene texto seleccionable.")
    save_deals(supermarket=supermarket, raw_text=raw_text)
    return {"ok": True, "supermarket": supermarket, "chars_extracted": len(raw_text)}


@app.get("/api/deals")
async def list_deals():
    return get_deals()


@app.delete("/api/deals")
async def remove_deals():
    clear_deals()
    return {"ok": True}


# ── Meals endpoints ──────────────────────────────────────────────────────────

@app.get("/api/meals")
async def list_meals(meal_type: Optional[str] = None):
    return get_all_meals(meal_type=meal_type)


@app.post("/api/meals")
async def add_meal(meal: MealCreate):
    return create_meal(meal.model_dump())


@app.delete("/api/meals/{meal_id}")
async def remove_meal(meal_id: int):
    delete_meal(meal_id)
    return {"ok": True}


# ── Pantry endpoints ──────────────────────────────────────────────────────────

@app.get("/api/pantry")
async def list_pantry():
    return get_pantry()


@app.put("/api/pantry")
async def set_pantry(items: list[dict]):
    update_pantry(items)
    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}
