# Meal Planner Agent — PRD & Architecture Document

> Este documento es el source of truth para construir el sistema completo.
> Está escrito para ser pasado directamente a Claude Code.

---

## 1. Contexto y objetivo

Aplicación personal de planificación de menús semanales con lista de compra automatizada.
Usuario único: estudiante de Erasmus en Viena.

**Problema que resuelve:**
- Perder tiempo decidiendo qué comer cada semana
- No aprovechar lo que ya tienes en casa
- No saber a qué supermercado ir para gastar menos

**Lo que hace el sistema:**
1. Pregunta qué tienes en casa
2. Genera un menú semanal eligiendo de tu catálogo personal de platos
3. Extrae la lista de ingredientes descontando lo que ya tienes
4. El usuario sube los folletos/docs de ofertas de esta semana
5. El sistema analiza los docs y recomienda a qué super ir

**Lo que NO hace (fuera de scope):**
- Autocompletar carrito en ninguna web
- Scraping automático de supermercados
- Multi-usuario
- App móvil
- Integración con APIs de supermercados (no existen públicas)

---

## 2. Stack técnico

```
Backend:    Python 3.11+
Framework:  FastAPI
Agentes:    LangGraph + LangChain
LLM:        Ollama (modelo local, e.g. llama3.1:8b o mistral)
Database:   PostgreSQL local (via psycopg2 + SQLAlchemy)
Docs:       El usuario sube manualmente los PDFs/texto de ofertas semanales
Frontend:   Next.js 14 + TypeScript + TailwindCSS
            (MVP muy simple: solo validar que el backend funciona)
Deploy:     Local en desarrollo
```

**Variables de entorno necesarias:**
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
DATABASE_URL=postgresql://user:password@localhost:5432/meal_planner
```

---

## 3. Estructura de carpetas

```
meal-planner/
├── backend/
│   ├── main.py                        # FastAPI app, endpoints
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── state.py                   # MealPlannerState (TypedDict)
│   │   ├── graph.py                   # Construye y compila el grafo
│   │   └── nodes/
│   │       ├── __init__.py
│   │       ├── parse_input.py         # LLM: texto → contexto estructurado
│   │       ├── ask_pantry.py          # INTERRUPT: pregunta despensa
│   │       ├── parse_pantry.py        # LLM: texto libre → inventario
│   │       ├── filter_meals.py        # Python: query DB con tags
│   │       ├── generate_menu.py       # LLM: elige platos del catálogo
│   │       ├── check_budget.py        # Python: valida coste vs presupuesto
│   │       ├── extract_ingredients.py # Python: agrupa y deduplica
│   │       ├── subtract_pantry.py     # Python: descuenta despensa
│   │       ├── analyze_deals.py       # LLM: analiza docs de ofertas subidos
│   │       └── format_output.py       # LLM: formatea output final
│   ├── db/
│   │   ├── __init__.py
│   │   ├── client.py                  # SQLAlchemy engine + session
│   │   ├── models.py                  # Modelos ORM
│   │   └── queries.py                 # Todas las queries a la DB
│   ├── prompts/
│   │   ├── parse_input.txt
│   │   ├── parse_pantry.txt
│   │   ├── generate_menu.txt
│   │   ├── analyze_deals.txt
│   │   └── format_output.txt
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Página única MVP: formulario + resultado
│   │   └── globals.css
│   ├── components/
│   │   ├── GenerateForm.tsx            # Formulario de generación
│   │   ├── PantryStep.tsx              # Paso de despensa
│   │   ├── DealsUpload.tsx             # Upload de docs de ofertas
│   │   └── ResultDisplay.tsx           # Menú + lista de compra + super recomendado
│   ├── lib/
│   │   └── api.ts                      # Cliente HTTP hacia FastAPI
│   ├── package.json
│   └── next.config.ts
└── db/
    └── schema.sql                      # Schema completo de la DB
```

---

## 4. Base de datos (PostgreSQL local)

### 4.1 Setup local

```bash
# Crear base de datos
createdb meal_planner

# Aplicar schema
psql meal_planner < db/schema.sql
```

### 4.2 Schema completo

```sql
-- Catálogo personal de platos
CREATE TABLE meals (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    ingredients TEXT[] NOT NULL DEFAULT '{}',
    tags        TEXT[] NOT NULL DEFAULT '{}',
    prep_time   INTEGER,                    -- minutos
    ai_generated BOOLEAN DEFAULT false,    -- true si lo inventó el LLM
    created_at  TIMESTAMP DEFAULT now()
);

-- Despensa (lo que tienes en casa ahora)
CREATE TABLE pantry (
    id          SERIAL PRIMARY KEY,
    item_name   TEXT NOT NULL UNIQUE,
    sufficient  BOOLEAN DEFAULT true,       -- true = suficiente para una receta
    updated_at  TIMESTAMP DEFAULT now()
);

-- Menús generados (historial)
CREATE TABLE weekly_menus (
    id              SERIAL PRIMARY KEY,
    week_start      DATE NOT NULL,
    context         TEXT,                   -- "gym lun/mié/vie, viaje jueves"
    budget          DECIMAL(6,2),
    menu_data       JSONB NOT NULL,         -- {monday: {breakfast, lunch, dinner}}
    shopping_list   JSONB,                  -- lista final después de descontar despensa
    recommended_super TEXT,
    estimated_cost  DECIMAL(6,2),
    created_at      TIMESTAMP DEFAULT now()
);

-- Docs de ofertas subidos por el usuario esta semana
CREATE TABLE weekly_deals (
    id          SERIAL PRIMARY KEY,
    week_start  DATE NOT NULL,
    supermarket TEXT NOT NULL,              -- "billa", "hofer", "penny", "spar"
    raw_text    TEXT NOT NULL,              -- texto extraído del doc/PDF
    uploaded_at TIMESTAMP DEFAULT now()
);
```

### 4.3 Tags disponibles

```
gym          → plato alto en proteína, post-entrenamiento
rest-day     → cualquier día sin gym
quick        → menos de 20 minutos de preparación
batch-cook   → se puede cocinar en cantidad y guardar
travel       → ligero, no requiere cocinar o fácil de transportar
cheap        → menos de €2 por ración estimada
```

### 4.4 Datos de ejemplo para meals

```sql
INSERT INTO meals (name, meal_type, ingredients, tags, prep_time) VALUES
('Porridge con plátano',        'breakfast', ARRAY['oats','banana','milk'],                  ARRAY['quick','cheap'],        10),
('Tostadas con huevo revuelto', 'breakfast', ARRAY['bread','eggs','butter'],                 ARRAY['quick','gym'],          10),
('Yogur con granola',           'breakfast', ARRAY['yogurt','granola','honey'],              ARRAY['quick','cheap'],         5),
('Pollo con arroz y espinacas', 'lunch',     ARRAY['chicken','rice','spinach','olive oil'],  ARRAY['gym','batch-cook'],     25),
('Pasta con tomate y atún',     'lunch',     ARRAY['pasta','tomato sauce','tuna'],           ARRAY['quick','cheap'],        15),
('Lentejas con verduras',       'lunch',     ARRAY['lentils','carrot','onion','tomato'],     ARRAY['cheap','batch-cook'],   35),
('Tortilla francesa',           'dinner',    ARRAY['eggs','olive oil','salt'],               ARRAY['quick','cheap'],        10),
('Salmón al horno',             'dinner',    ARRAY['salmon','lemon','garlic','olive oil'],   ARRAY['gym'],                  20),
('Ensalada con atún',           'dinner',    ARRAY['lettuce','tomato','tuna','olive oil'],   ARRAY['quick','cheap'],        10);
```

---

## 5. LangGraph: State y grafo

### 5.1 State completo

```python
# backend/graph/state.py

from typing import TypedDict, Optional

class MealPlannerState(TypedDict):
    # --- Input del usuario ---
    raw_input: str              # texto libre del formulario
    budget: float               # presupuesto en euros
    context: dict               # {gym_days: [...], travel_days: [...], notes: "..."}

    # --- Despensa ---
    pantry_raw: str             # respuesta en texto libre del usuario
    pantry_items: list          # [{name, sufficient}] parseado por LLM

    # --- Catálogo filtrado ---
    filtered_meals: list        # platos de la DB que encajan con el contexto

    # --- Menú generado ---
    menu: dict                  # {monday: {breakfast: "...", lunch: "...", dinner: "..."}}
    estimated_cost: float       # coste estimado del menú completo
    budget_ok: bool             # True si estimated_cost <= budget
    retry_count: int            # contador de reintentos por presupuesto (max 2)

    # --- Lista de compra ---
    ingredients: list           # [{name, quantity, unit, category}] todos los ingredientes
    final_list: list            # ingredients después de descontar pantry_items

    # --- Ofertas (docs subidos por el usuario) ---
    deals_text: dict            # {billa: "texto raw...", hofer: "texto raw..."}
    deals: dict                 # {billa: [...], hofer: [...]} — ofertas parseadas
    recommended_super: str      # "Hofer"
    super_reasoning: str        # "Tienen pollo y arroz en oferta, cubre el 60% de tu lista"

    # --- Output ---
    final_output: dict          # todo junto para el frontend
```

### 5.2 Construcción del grafo

```python
# backend/graph/graph.py

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from .state import MealPlannerState
from .nodes import (
    parse_input, ask_pantry, parse_pantry,
    filter_meals, generate_menu, check_budget,
    extract_ingredients, subtract_pantry,
    analyze_deals, format_output
)

def should_retry_or_continue(state: MealPlannerState) -> str:
    if not state["budget_ok"] and state.get("retry_count", 0) < 2:
        return "generate_menu"
    return "extract_ingredients"

def build_graph():
    builder = StateGraph(MealPlannerState)

    builder.add_node("parse_input",          parse_input.run)
    builder.add_node("ask_pantry",           ask_pantry.run)
    builder.add_node("parse_pantry",         parse_pantry.run)
    builder.add_node("filter_meals",         filter_meals.run)
    builder.add_node("generate_menu",        generate_menu.run)
    builder.add_node("check_budget",         check_budget.run)
    builder.add_node("extract_ingredients",  extract_ingredients.run)
    builder.add_node("subtract_pantry",      subtract_pantry.run)
    builder.add_node("analyze_deals",        analyze_deals.run)
    builder.add_node("format_output",        format_output.run)

    builder.set_entry_point("parse_input")
    builder.add_edge("parse_input",         "ask_pantry")
    builder.add_edge("ask_pantry",          "parse_pantry")
    builder.add_edge("parse_pantry",        "filter_meals")
    builder.add_edge("filter_meals",        "generate_menu")
    builder.add_edge("extract_ingredients", "subtract_pantry")
    builder.add_edge("subtract_pantry",     "analyze_deals")
    builder.add_edge("analyze_deals",       "format_output")
    builder.add_edge("format_output",       END)

    builder.add_conditional_edges(
        "check_budget",
        should_retry_or_continue,
        {
            "generate_menu":        "generate_menu",
            "extract_ingredients":  "extract_ingredients"
        }
    )
    builder.add_edge("generate_menu", "check_budget")

    memory = MemorySaver()
    return builder.compile(
        checkpointer=memory,
        interrupt_before=["ask_pantry"]
    )

graph = build_graph()
```

---

## 6. Nodos — implementación detallada

### 6.1 parse_input (LLM)

```python
# backend/graph/nodes/parse_input.py

from langchain_ollama import ChatOllama
from ..state import MealPlannerState
import os, json

llm = ChatOllama(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
)

PROMPT = """
Extrae información estructurada del siguiente input del usuario.
Devuelve SOLO JSON válido, sin markdown, sin explicaciones.

Input: {raw_input}

JSON esperado:
{{
  "budget": <float, presupuesto en euros>,
  "context": {{
    "gym_days": ["mon","tue","wed","thu","fri","sat","sun"],
    "travel_days": ["mon",...],
    "notes": "cualquier otra cosa relevante"
  }}
}}

Días de la semana siempre en inglés abreviado: mon, tue, wed, thu, fri, sat, sun.
Si no se menciona presupuesto, usa 50.0 como default.
Si no hay días de gym, usa array vacío.
"""

def run(state: MealPlannerState) -> dict:
    response = llm.invoke(PROMPT.format(raw_input=state["raw_input"]))
    parsed = json.loads(response.content)
    return {
        "budget": parsed["budget"],
        "context": parsed["context"]
    }
```

### 6.2 ask_pantry (INTERRUPT)

```python
# backend/graph/nodes/ask_pantry.py

from ..state import MealPlannerState

def run(state: MealPlannerState) -> dict:
    # El interrupt ocurre ANTES de este nodo (interrupt_before=["ask_pantry"])
    # pantry_raw ya está en el state, puesto por el endpoint de resume
    return {}
```

### 6.3 parse_pantry (LLM)

```python
# backend/graph/nodes/parse_pantry.py

from langchain_ollama import ChatOllama
from ..state import MealPlannerState
import os, json

llm = ChatOllama(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
)

PROMPT = """
El usuario dice que tiene esto en casa: "{pantry_raw}"

Extrae cada item como ingrediente. Si menciona "medio", "poco", "algo de" → sufficient: true igualmente.
Si dice "se me acabó" o "no tengo" → no incluyas ese item.
Normaliza los nombres en español, en singular y minúsculas.

Devuelve SOLO JSON:
{{
  "items": [
    {{"name": "sal",    "sufficient": true}},
    {{"name": "aceite", "sufficient": true}}
  ]
}}
"""

def run(state: MealPlannerState) -> dict:
    response = llm.invoke(PROMPT.format(pantry_raw=state["pantry_raw"]))
    parsed = json.loads(response.content)
    return {"pantry_items": parsed["items"]}
```

### 6.4 filter_meals (Python puro)

```python
# backend/graph/nodes/filter_meals.py

from db.queries import get_all_meals
from ..state import MealPlannerState

def run(state: MealPlannerState) -> dict:
    context = state["context"]
    gym_days = context.get("gym_days", [])
    travel_days = context.get("travel_days", [])

    all_meals = get_all_meals()

    if travel_days:
        all_meals = [
            m for m in all_meals
            if "batch-cook" not in m.get("tags", [])
            or m["meal_type"] != "dinner"
        ]

    if gym_days:
        all_meals.sort(
            key=lambda m: ("gym" in m.get("tags", [])),
            reverse=True
        )

    return {"filtered_meals": all_meals}
```

### 6.5 generate_menu (LLM)

```python
# backend/graph/nodes/generate_menu.py

from langchain_ollama import ChatOllama
from ..state import MealPlannerState
import os, json

llm = ChatOllama(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
)

PROMPT = """
Eres un planificador de comidas. Crea un menú semanal para el usuario.

CATÁLOGO DE PLATOS DISPONIBLES:
{meals_list}

CONTEXTO DE LA SEMANA:
- Presupuesto: €{budget}
- Días de entrenamiento (necesitan más proteína): {gym_days}
- Días de viaje (comidas ligeras o fuera): {travel_days}
- Notas: {notes}
- Reintento nº {retry_count}: {retry_instruction}

REGLAS:
1. Elige SIEMPRE del catálogo. Solo puedes inventar un plato si marcas "ai_generated": true.
2. No repitas el mismo plato más de 2 veces en la semana.
3. Los días de gym, pon platos con tag "gym" en comida o cena.
4. Los días de viaje, pon solo desayuno y comida (cena: null).
5. Reutiliza ingredientes entre días para optimizar la compra.
6. Estima el coste total semanal en euros (rough estimate).

Devuelve SOLO JSON:
{{
  "menu": {{
    "monday":    {{"breakfast": "nombre", "lunch": "nombre", "dinner": "nombre o null"}},
    "tuesday":   {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}},
    "wednesday": {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}},
    "thursday":  {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}},
    "friday":    {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}},
    "saturday":  {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}},
    "sunday":    {{"breakfast": "...",    "lunch": "...",    "dinner": "..."}}
  }},
  "ai_generated_meals": [],
  "estimated_cost": 47.50
}}
"""

def run(state: MealPlannerState) -> dict:
    meals_list = "\n".join([
        f"- [{m['meal_type']}] {m['name']} | ingredientes: {', '.join(m['ingredients'])} | tags: {', '.join(m['tags'])}"
        for m in state["filtered_meals"]
    ])

    retry_count = state.get("retry_count", 0)
    retry_instruction = (
        f"El menú anterior costaba €{state.get('estimated_cost', 0):.2f}, que supera el presupuesto. Reduce el coste."
        if retry_count > 0 else "Primera generación."
    )

    context = state["context"]
    response = llm.invoke(PROMPT.format(
        meals_list=meals_list,
        budget=state["budget"],
        gym_days=context.get("gym_days", []),
        travel_days=context.get("travel_days", []),
        notes=context.get("notes", "ninguna"),
        retry_count=retry_count,
        retry_instruction=retry_instruction
    ))

    parsed = json.loads(response.content)
    return {
        "menu": parsed["menu"],
        "estimated_cost": parsed["estimated_cost"],
        "retry_count": retry_count
    }
```

### 6.6 check_budget (Python puro)

```python
# backend/graph/nodes/check_budget.py

from ..state import MealPlannerState

def run(state: MealPlannerState) -> dict:
    budget_ok = state["estimated_cost"] <= state["budget"] * 1.05  # 5% de margen
    return {
        "budget_ok": budget_ok,
        "retry_count": state.get("retry_count", 0) + (0 if budget_ok else 1)
    }
```

### 6.7 extract_ingredients (Python puro)

```python
# backend/graph/nodes/extract_ingredients.py

from ..state import MealPlannerState
from collections import defaultdict

CATEGORIES = {
    "vegetables": ["spinach","carrot","onion","tomato","lettuce","pepper","garlic","potato"],
    "proteins":   ["chicken","salmon","tuna","eggs","lentils","beef"],
    "dairy":      ["milk","yogurt","butter","cheese"],
    "grains":     ["rice","pasta","bread","oats","granola"],
    "pantry":     ["olive oil","salt","honey","tomato sauce","lemon"],
}

def categorize(ingredient: str) -> str:
    ing = ingredient.lower()
    for category, items in CATEGORIES.items():
        if any(item in ing for item in items):
            return category
    return "other"

def run(state: MealPlannerState) -> dict:
    menu = state["menu"]
    meals_db = {m["name"]: m for m in state["filtered_meals"]}

    all_ingredients = defaultdict(int)
    for day, meals in menu.items():
        for meal_type, meal_name in meals.items():
            if meal_name and meal_name in meals_db:
                for ing in meals_db[meal_name]["ingredients"]:
                    all_ingredients[ing.lower()] += 1

    ingredients = [
        {
            "name": name,
            "times_used": count,
            "category": categorize(name),
            "quantity": None,
            "unit": None
        }
        for name, count in all_ingredients.items()
    ]

    ingredients.sort(key=lambda x: x["category"])
    return {"ingredients": ingredients}
```

### 6.8 subtract_pantry (Python puro)

```python
# backend/graph/nodes/subtract_pantry.py

from ..state import MealPlannerState

def run(state: MealPlannerState) -> dict:
    pantry_names = {
        item["name"].lower()
        for item in state.get("pantry_items", [])
        if item.get("sufficient", True)
    }

    final_list = [
        ing for ing in state["ingredients"]
        if ing["name"].lower() not in pantry_names
    ]

    removed = [
        ing["name"] for ing in state["ingredients"]
        if ing["name"].lower() in pantry_names
    ]

    return {
        "final_list": final_list,
        "pantry_removed": removed
    }
```

### 6.9 analyze_deals (LLM)

**Responsabilidad:** Analizar los textos de ofertas que el usuario ha subido manualmente y recomendar supermercado.

El usuario sube los docs de descuentos esta semana (texto copiado del folleto, PDF parseado, foto, etc.).
El endpoint `/api/deals/upload` los almacena. El nodo los lee de `state["deals_text"]`.

```python
# backend/graph/nodes/analyze_deals.py

from langchain_ollama import ChatOllama
from ..state import MealPlannerState
import os, json

llm = ChatOllama(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
)

PROMPT = """
Tienes los folletos de ofertas de esta semana de varios supermercados y la lista de compra del usuario.

LISTA DE COMPRA DEL USUARIO:
{shopping_list}

OFERTAS POR SUPERMERCADO:
{deals_text}

Para cada supermercado, identifica qué productos de la lista están en oferta.
Elige el supermercado que mejor cubre la lista con ofertas.

Devuelve SOLO JSON:
{{
  "deals": {{
    "billa":  ["producto1", "producto2"],
    "hofer":  ["producto1"],
    "penny":  [],
    "spar":   ["producto1", "producto2", "producto3"]
  }},
  "recommended": "spar",
  "reasoning": "Tienen en oferta el 60% de tu lista: pollo, pasta y yogur"
}}

Si no hay texto de ofertas para un supermercado, pon array vacío.
"""

def run(state: MealPlannerState) -> dict:
    deals_text = state.get("deals_text", {})

    if not deals_text:
        return {
            "deals": {},
            "recommended_super": "Sin datos",
            "super_reasoning": "No se subieron docs de ofertas esta semana."
        }

    deals_formatted = "\n\n".join([
        f"=== {super_name.upper()} ===\n{text}"
        for super_name, text in deals_text.items()
    ])

    shopping_names = [item["name"] for item in state.get("final_list", [])]

    response = llm.invoke(PROMPT.format(
        shopping_list=", ".join(shopping_names),
        deals_text=deals_formatted
    ))

    parsed = json.loads(response.content)
    return {
        "deals": parsed["deals"],
        "recommended_super": parsed["recommended"].capitalize(),
        "super_reasoning": parsed["reasoning"]
    }
```

### 6.10 format_output (LLM)

```python
# backend/graph/nodes/format_output.py

from langchain_ollama import ChatOllama
from ..state import MealPlannerState
import os, json

llm = ChatOllama(
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    model=os.getenv("OLLAMA_MODEL", "llama3.1:8b"),
)

PROMPT = """
Tienes toda la información de la semana. Genera el output final estructurado.

MENÚ:
{menu}

LISTA DE COMPRA (ya descontada la despensa):
{final_list}

ITEMS DE DESPENSA DESCARTADOS:
{pantry_removed}

SUPERMERCADO RECOMENDADO: {recommended_super}
RAZÓN: {super_reasoning}

PRESUPUESTO: €{budget}
COSTE ESTIMADO: €{estimated_cost}

Para cada ingrediente de la lista, añade una cantidad estimada realista (quantity + unit).
Ejemplo: "pollo" → quantity: 600, unit: "g"

Devuelve SOLO JSON:
{{
  "menu": {{mismo formato de entrada}},
  "shopping_list": {{
    "vegetables": [{{"name": "...", "quantity": 500, "unit": "g"}}],
    "proteins":   [...],
    "dairy":      [...],
    "grains":     [...],
    "pantry":     [...],
    "other":      [...]
  }},
  "pantry_skipped": ["sal", "aceite", ...],
  "supermarket": {{
    "recommended": "Hofer",
    "reasoning": "..."
  }},
  "budget_summary": {{
    "budget": 55.0,
    "estimated": 47.50,
    "remaining": 7.50
  }}
}}
"""

def run(state: MealPlannerState) -> dict:
    response = llm.invoke(PROMPT.format(
        menu=json.dumps(state["menu"], ensure_ascii=False),
        final_list=json.dumps(state.get("final_list", []), ensure_ascii=False),
        pantry_removed=json.dumps(state.get("pantry_removed", []), ensure_ascii=False),
        recommended_super=state.get("recommended_super", ""),
        super_reasoning=state.get("super_reasoning", ""),
        budget=state["budget"],
        estimated_cost=state.get("estimated_cost", 0)
    ))

    parsed = json.loads(response.content)
    return {"final_output": parsed}
```

---

## 7. FastAPI — Endpoints

```python
# backend/main.py

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid

from graph.graph import graph
from db.queries import get_all_meals, create_meal, delete_meal, get_pantry, update_pantry, save_deals, get_deals

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modelos de request ---

class GenerateRequest(BaseModel):
    raw_input: str      # "€55, gym lun/mié/vie, viaje jueves"

class PantryResponse(BaseModel):
    thread_id: str
    pantry_raw: str     # "tengo sal, aceite y unos filetes"

class MealCreate(BaseModel):
    name: str
    meal_type: str
    ingredients: list[str]
    tags: list[str]
    prep_time: Optional[int] = None

# --- Endpoints del grafo ---

@app.post("/api/generate/start")
async def start_generation(req: GenerateRequest):
    """
    Inicia el grafo hasta el interrupt de ask_pantry.
    Devuelve thread_id para continuar.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # Cargar deals de esta semana desde la DB
    deals_text = get_deals()

    initial_state = {
        "raw_input": req.raw_input,
        "deals_text": deals_text
    }

    await graph.ainvoke(initial_state, config)

    return {
        "thread_id": thread_id,
        "question": "¿Qué tienes en casa esta semana? Escríbelo como quieras."
    }

@app.post("/api/generate/resume")
async def resume_generation(req: PantryResponse):
    """
    Reanuda el grafo con la respuesta de despensa.
    """
    config = {"configurable": {"thread_id": req.thread_id}}

    await graph.aupdate_state(
        config,
        {"pantry_raw": req.pantry_raw},
        as_node="ask_pantry"
    )

    result = await graph.ainvoke(None, config)
    return result["final_output"]

# --- Endpoints de deals (docs subidos por el usuario) ---

@app.post("/api/deals/upload")
async def upload_deals(supermarket: str = Form(...), text: str = Form(...)):
    """
    El usuario sube el texto de las ofertas de esta semana de un supermercado.
    Se puede llamar varias veces (una por supermercado).
    """
    save_deals(supermarket=supermarket, raw_text=text)
    return {"ok": True, "supermarket": supermarket}

@app.get("/api/deals")
async def list_deals():
    return get_deals()

@app.delete("/api/deals")
async def clear_deals():
    """Limpia los deals antes de subir los de la nueva semana."""
    from db.queries import clear_deals as _clear
    _clear()
    return {"ok": True}

# --- Endpoints de meals (CRUD) ---

@app.get("/api/meals")
async def list_meals(meal_type: Optional[str] = None):
    return get_all_meals(meal_type=meal_type)

@app.post("/api/meals")
async def add_meal(meal: MealCreate):
    return create_meal(meal.dict())

@app.delete("/api/meals/{meal_id}")
async def remove_meal(meal_id: int):
    delete_meal(meal_id)
    return {"ok": True}

# --- Endpoints de pantry ---

@app.get("/api/pantry")
async def list_pantry():
    return get_pantry()

@app.put("/api/pantry")
async def set_pantry(items: list[dict]):
    update_pantry(items)
    return {"ok": True}

# --- Health check ---

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

---

## 8. Frontend MVP — Next.js muy simple

**Objetivo del MVP:** Validar que el backend funciona correctamente. UI mínima, funcional, sin polish.

### Página única (`app/page.tsx`)

Una sola página con 4 secciones secuenciales:

```
1. [Formulario inicial]
   - Input: contexto semanal (textarea)
   - Botón: "Generar menú"

2. [Pregunta de despensa] (aparece tras el start)
   - Textarea: "¿Qué tienes en casa?"
   - Botón: "Continuar"

3. [Resultado] (aparece tras el resume)
   - Menú 7 días (tabla simple)
   - Lista de compra (lista con checkboxes)
   - Supermercado recomendado (texto)

4. [Upload de ofertas] (sección siempre visible al lado)
   - Select: supermercado
   - Textarea: pegar el texto de las ofertas
   - Botón: "Subir"
```

No hay routing, no hay navegación, no hay modal. Todo en una pantalla.

### Componentes del MVP

**`GenerateForm.tsx`** — solo el textarea + botón, llama a `/api/generate/start`

**`PantryStep.tsx`** — textarea + botón, llama a `/api/generate/resume`

**`DealsUpload.tsx`** — select de supermercado + textarea + botón, llama a `/api/deals/upload`

**`ResultDisplay.tsx`** — muestra `final_output` como JSON formateado en una `<pre>` de momento. Cuando el backend esté validado, se pule el display.

### `lib/api.ts`

```typescript
const BASE = "http://localhost:8000";

export async function startGeneration(rawInput: string) {
  const res = await fetch(`${BASE}/api/generate/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_input: rawInput }),
  });
  return res.json();
}

export async function resumeGeneration(threadId: string, pantryRaw: string) {
  const res = await fetch(`${BASE}/api/generate/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, pantry_raw: pantryRaw }),
  });
  return res.json();
}

export async function uploadDeals(supermarket: string, text: string) {
  const body = new FormData();
  body.append("supermarket", supermarket);
  body.append("text", text);
  const res = await fetch(`${BASE}/api/deals/upload`, { method: "POST", body });
  return res.json();
}
```

---

## 9. DB client (SQLAlchemy)

```python
# backend/db/client.py

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/meal_planner")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

```python
# backend/db/queries.py
# Todas las queries usando SQLAlchemy core o psycopg2 directo, sin ORM complejo.
# Devuelven siempre listas de dicts para facilitar serialización JSON.

from .client import engine
from sqlalchemy import text
from datetime import date

def get_all_meals(meal_type=None):
    with engine.connect() as conn:
        if meal_type:
            result = conn.execute(text("SELECT * FROM meals WHERE meal_type = :t"), {"t": meal_type})
        else:
            result = conn.execute(text("SELECT * FROM meals"))
        return [dict(row._mapping) for row in result]

def create_meal(data: dict):
    with engine.connect() as conn:
        result = conn.execute(
            text("INSERT INTO meals (name, meal_type, ingredients, tags, prep_time) VALUES (:name, :meal_type, :ingredients, :tags, :prep_time) RETURNING *"),
            data
        )
        conn.commit()
        return dict(result.fetchone()._mapping)

def delete_meal(meal_id: int):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM meals WHERE id = :id"), {"id": meal_id})
        conn.commit()

def get_pantry():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM pantry"))
        return [dict(row._mapping) for row in result]

def update_pantry(items: list[dict]):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM pantry"))
        for item in items:
            conn.execute(
                text("INSERT INTO pantry (item_name, sufficient) VALUES (:item_name, :sufficient)"),
                item
            )
        conn.commit()

def save_deals(supermarket: str, raw_text: str):
    with engine.connect() as conn:
        conn.execute(
            text("INSERT INTO weekly_deals (week_start, supermarket, raw_text) VALUES (:week_start, :supermarket, :raw_text) ON CONFLICT DO NOTHING"),
            {"week_start": date.today(), "supermarket": supermarket, "raw_text": raw_text}
        )
        conn.commit()

def get_deals() -> dict:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT supermarket, raw_text FROM weekly_deals WHERE week_start = :today"), {"today": date.today()})
        return {row.supermarket: row.raw_text for row in result}

def clear_deals():
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM weekly_deals WHERE week_start = :today"), {"today": date.today()})
        conn.commit()
```

---

## 10. Requirements

```txt
# backend/requirements.txt
fastapi==0.111.0
uvicorn==0.29.0
langchain==0.2.0
langchain-ollama==0.1.0
langgraph==0.1.14
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
python-dotenv==1.0.1
pydantic==2.7.1
python-multipart==0.0.9
```

```json
// frontend/package.json (dependencias clave)
{
  "dependencies": {
    "next": "14",
    "react": "^18",
    "react-dom": "^18",
    "typescript": "^5"
  },
  "devDependencies": {
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8"
  }
}
```

---

## 11. Orden de construcción recomendado

### Fase 1 — Base de datos y DB layer
1. Levantar PostgreSQL local + crear base de datos
2. `db/schema.sql` + seed de meals de ejemplo
3. `db/client.py` + `db/queries.py`
4. Test: conectar y hacer queries básicas

### Fase 2 — Nodos Python puro (sin LLM)
5. Nodo `filter_meals` + test unitario
6. Nodo `extract_ingredients` + test unitario
7. Nodo `subtract_pantry` + test unitario
8. Nodo `check_budget` + test unitario

### Fase 3 — Ollama + nodos LLM
9. Instalar y verificar Ollama local (`ollama run llama3.1:8b`)
10. Nodo `parse_input` — test con texto libre
11. Nodo `parse_pantry` — test con texto libre
12. Nodo `generate_menu` — test con catálogo real
13. Nodo `analyze_deals` — test con texto de folleto de ejemplo
14. Nodo `format_output`

### Fase 4 — Grafo completo
15. `state.py` completo
16. `graph.py` con interrupt y conditional edge
17. Endpoints `/api/generate/start` y `/api/generate/resume`
18. Test del flujo completo end-to-end

### Fase 5 — Frontend MVP
19. Scaffolding Next.js + Tailwind
20. Página única con formulario + resultado raw (JSON en `<pre>`)
21. Endpoint `/api/deals/upload` + UI de upload
22. Validar que el backend funciona correctamente desde el browser

### Fase 6 — Polish frontend (tras validar backend)
23. `MenuDisplay` con tabla de 7 días
24. `ShoppingList` con checkboxes por categoría
25. Badge del supermercado recomendado
26. Loading states y manejo de errores

---

## 12. Decisiones de diseño y trade-offs

**¿Por qué Ollama en lugar de Claude/OpenAI?**
Coste cero, privacidad total, funciona offline. El tradeoff es que la calidad de los outputs JSON puede ser menos consistente con modelos pequeños — si hay problemas, subir a `llama3.1:70b` o añadir retry con JSON parsing más robusto.

**¿Por qué PostgreSQL local en lugar de Supabase?**
Sin dependencias externas, sin coste, control total. En producción se puede migrar a cualquier Postgres hosted con solo cambiar `DATABASE_URL`.

**¿Por qué el usuario sube los docs de ofertas manualmente?**
Scraping de meinprospekt.at requiere mantenimiento continuo de selectores CSS. El usuario ya tiene acceso a los folletos semanales (app del super, email, web) — copiar el texto y pegarlo es suficiente para el MVP y es mucho más robusto que scraping.

**¿Por qué un frontend tan simple al principio?**
Porque el valor del sistema está en el backend (el grafo LangGraph). Validar que parse_input, generate_menu y analyze_deals funcionan correctamente es prioritario. Pulir la UI es un problema de una iteración posterior.

**¿Por qué LangGraph y no LangChain simple?**
Porque necesitas el interrupt para la pregunta de despensa y el conditional edge para el retry de presupuesto. Con LangChain lineal eso lo tendrías que orquestar manualmente.

**¿Por qué solo 4 nodos usan LLM?**
Porque el LLM es lento y los modelos locales son más limitados. Todo lo que es lógica determinista (filtrar DB, sumar costes, descontar despensa) se hace en Python puro.

**¿Por qué no hay autenticación?**
Es una app personal de un solo usuario. Auth añade complejidad sin añadir valor en este momento.
