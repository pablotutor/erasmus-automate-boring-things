# Architecture — Erasmus Automate

> Documento de arquitectura actualizado al estado real del sistema (junio 2026).

---

## Visión general

Sistema de planificación de menús semanales compuesto por un agente LangGraph multi-step, una API REST FastAPI y una SPA Next.js. El agente orquesta llamadas al LLM (Ollama Cloud) con lógica Python pura para generar un menú personalizado, descontar la despensa y recomendar supermercado.

---

## Diagrama del sistema

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                    │
│  Tab: Mis platos │ Tab: Ofertas │ Tab: Agente           │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP REST
┌──────────────────────────▼──────────────────────────────┐
│                   FastAPI (puerto 8000)                  │
│  /api/meals  /api/deals  /api/generate  /api/menus       │
│  /api/pantry  /api/logs  /api/health                     │
└──────┬───────────────────┬────────────────┬─────────────┘
       │                   │                │
       ▼                   ▼                ▼
 PostgreSQL          LangGraph         Ollama Cloud
 (local)             (agente)          gpt-oss:120b
                         │
                    Hugging Face
                   (imágenes IA)
```

---

## Agente LangGraph

### Grafo de ejecución

```
[START]
   │
   ▼
parse_input          ← LLM: valida y estructura budget + actividades + notas
   │
   ▼
ask_pantry           ← INTERRUPT (interrupt_before): espera confirmación del usuario
   │                    El frontend llama a /api/generate/resume para reanudar
   ▼
parse_pantry         ← LLM: convierte texto libre de despensa en lista estructurada
   │
   ▼
filter_meals         ← Python: filtra catálogo según tipo de día (deporte / viaje / normal)
   │
   ▼
generate_menu        ← LLM: elige platos del catálogo y construye menú de 7 días
   │
   ▼
check_budget         ← Python: estimated_cost <= budget * 1.05?
   │
   ├── NO (retry_count < 2) ──► generate_menu  (reintentar con instrucción de abaratar)
   │
   └── SÍ ──►
              extract_ingredients  ← Python: agrega y deduplica ingredientes del menú
                 │
                 ▼
              subtract_pantry      ← Python: descuenta items de despensa de la lista
                 │
                 ▼
              analyze_deals        ← LLM: cruza lista de compra con ofertas → recomienda super
                 │
                 ▼
              format_output        ← LLM: ensambla JSON final para el frontend
                 │
                 ▼
             [END]
```

### Nodos — responsabilidades

| Nodo | Tipo | Qué hace |
|------|------|---------|
| `parse_input` | LLM | Valida budget, extrae días de actividad y notas del request |
| `ask_pantry` | INTERRUPT | Nodo vacío — el interrupt ocurre antes de él; el frontend inyecta el estado de despensa al reanudar |
| `parse_pantry` | LLM | Convierte el texto de despensa en `[{item_name, sufficient}]` |
| `filter_meals` | Python | Consulta BD y filtra/prioriza platos según días de gym / viaje |
| `generate_menu` | LLM | Elige platos del catálogo y estima coste semanal |
| `check_budget` | Python | Compara `estimated_cost <= budget * 1.05`; incrementa `retry_count` si falla |
| `extract_ingredients` | Python | Agrega ingredientes de todos los platos del menú, deduplica |
| `subtract_pantry` | Python | Elimina de la lista lo que ya hay en despensa (`sufficient: true`) |
| `analyze_deals` | LLM | Cruza lista final con texto de ofertas de BD; devuelve supermercado recomendado |
| `format_output` | LLM | Construye el JSON final: menú + lista por categorías + super + resumen de presupuesto |

### Checkpoint y estado

El grafo usa `MemorySaver` como checkpointer. Cada ejecución tiene un `thread_id` UUID. El estado (`MealPlannerState`) se persiste entre el `start` y el `resume`:

```python
class MealPlannerState(TypedDict):
    # Input
    budget: float
    calistenia_days: list[str]
    running_days: list[str]
    football_days: list[str]
    travel_days: list[str]
    notes: str
    week_target: str          # "current" | "next"

    # Despensa
    pantry_items: list[dict]  # [{item_name, sufficient}]

    # Catálogo filtrado
    filtered_meals: list[dict]

    # Menú
    menu: dict                # {mon: {breakfast, lunch, dinner}, ...}
    estimated_cost: float
    budget_ok: bool
    retry_count: int

    # Lista de compra
    ingredients: list[dict]
    final_list: list[dict]

    # Ofertas
    deals_text: str
    recommended_super: str
    super_reasoning: str

    # Output
    final_output: dict
```

---

## API REST

### Flujo de generación (dos llamadas)

```
POST /api/generate/start
  Body: { budget, calistenia_days, running_days, football_days, travel_days, notes, week_target }
  → Carga despensa y deals de BD
  → Ejecuta el grafo hasta interrupt_before["ask_pantry"]
  → Returns: { thread_id, pantry_items }

POST /api/generate/resume
  Body: { thread_id, pantry_items }
  → graph.aupdate_state() inyecta la despensa confirmada
  → graph.ainvoke() reanuda hasta END
  → Persiste menú en BD (weekly_menus)
  → Returns: { menu, shopping_list, supermarket, budget_summary }
```

### Tabla de endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/generate/start` | Inicia agente, pausa en despensa |
| `POST` | `/api/generate/resume` | Reanuda agente con despensa confirmada |
| `POST` | `/api/generate/adjust` | Reemplaza un plato concreto y recalcula |
| `GET`  | `/api/menus/current` | Menú de la semana actual |
| `GET`  | `/api/menus/next` | Menú de la semana siguiente |
| `PATCH`| `/api/menus/{week}/meal` | Edita un plato concreto del menú guardado |
| `GET`  | `/api/meals` | Lista catálogo de platos |
| `POST` | `/api/meals` | Crea plato |
| `PUT`  | `/api/meals/{id}` | Edita plato |
| `DELETE`| `/api/meals/{id}` | Elimina plato |
| `POST` | `/api/meals/{id}/image` | Sube imagen para un plato |
| `POST` | `/api/meals/generate-image` | Genera imagen IA con Hugging Face |
| `DELETE`| `/api/meals/generated-image/{filename}` | Elimina imagen generada |
| `POST` | `/api/meals/suggest` | LLM sugiere nuevos platos |
| `GET`  | `/api/pantry` | Lee estado de despensa |
| `PUT`  | `/api/pantry` | Actualiza despensa |
| `POST` | `/api/deals/scrape/{supermarket}` | Scraping de Billa o Hofer |
| `POST` | `/api/deals/upload-pdf/{supermarket}` | Extrae texto de PDF de ofertas |
| `GET`  | `/api/deals` | Lista ofertas activas |
| `DELETE`| `/api/deals` | Borra todas las ofertas |
| `GET`  | `/api/logs/{thread_id}` | Logs de ejecución nodo a nodo |
| `GET`  | `/api/health` | Health check |

---

## Frontend

### Estructura de tabs

```
app/page.tsx
├── Tab: Mis platos  → components/MisPlatos.tsx
├── Tab: Ofertas     → components/Ofertas.tsx
└── Tab: Agente      → components/Agente.tsx
                          ├── GenerateForm.tsx   (paso 1: configurar semana)
                          ├── PantryStep.tsx     (paso 2: confirmar despensa)
                          └── ResultDisplay.tsx  (paso 3: menú + lista + super)
```

### Flujo de datos en el frontend

```
1. GenerateForm → POST /api/generate/start
     ↓ { thread_id, pantry_items }
2. PantryStep (usuario edita) → POST /api/generate/resume
     ↓ { menu, shopping_list, supermarket, budget_summary }
3. ResultDisplay muestra resultado
     ↓ usuario cambia un plato → PATCH /api/menus/{week}/meal
```

### Componentes clave

| Componente | Función |
|------------|---------|
| `MisPlatos.tsx` | CRUD catálogo: tabla de platos, edición inline, subida/generación de imagen, sugerencias IA |
| `Ofertas.tsx` | Vista de ofertas activas, botón de scraping por super, gestión |
| `DealsUpload.tsx` | Modal de subida de PDF de folletos |
| `Agente.tsx` | Orquesta los 3 pasos del flujo del agente, calendario visual de actividades |
| `GenerateForm.tsx` | Formulario: presupuesto, selector de días por actividad, notas, selector de semana |
| `PantryStep.tsx` | Lista editable de items de despensa con toggle sufficient |
| `ResultDisplay.tsx` | Menú semanal editable + lista de compra por categorías + badge de supermercado |
| `lib/api.ts` | Todas las funciones fetch hacia el backend |

---

## Capa de base de datos

SQLAlchemy Core (sin ORM), todas las queries en `db/queries.py`, devuelven `list[dict]`.

### Funciones principales

| Función | Descripción |
|---------|-------------|
| `get_all_meals(meal_type?)` | Catálogo completo o filtrado por tipo |
| `create_meal / update_meal / delete_meal` | CRUD catálogo |
| `get_pantry / update_pantry` | Lee y sobreescribe despensa |
| `save_deals / get_deals / clear_deals` | Gestión de ofertas semanales |
| `get_valid_deals_meta` | Ofertas activas con metadatos (expiración, super) |
| `save_menu / update_menu` | Persiste menú generado |
| `get_current_week_menu / get_next_week_menu` | Recupera menú por semana |
| `patch_menu_meal` | Actualiza un plato concreto dentro del menú |
| `get_node_logs(thread_id)` | Logs de ejecución del agente |

---

## Integración con servicios externos

### Ollama Cloud (`llm.py`)

Wrapper fino sobre el cliente Ollama que expone la interfaz `.invoke(prompt) → Response`:

```python
class OllamaCloudLLM:
    def invoke(self, prompt: str) -> _Response:
        response = self.client.chat(model=self.model, messages=[...])
        return _Response(content=response.message.content)
```

El mismo objeto `get_llm()` se comparte entre todos los nodos.

### Hugging Face (generación de imagen)

`POST /api/meals/generate-image` llama a `InferenceClient` de `huggingface_hub` con un prompt construido a partir del nombre y descripción del plato. La imagen se guarda en `backend/static/uploads/meals/` y se sirve como fichero estático.

### Scraper (`scraper.py`)

```python
SUPERMARKET_URLS = {
    "billa": "https://shop.billa.at/aktionen",
    "hofer": "https://www.hofer.at/de/angebote/aktionen.html",
}
```

Hace GET con headers de navegador real, extrae nombres de productos de etiquetas `<h3>`, deduplica y devuelve texto crudo que se almacena en `weekly_deals`.

---

## Decisiones de arquitectura

**Interrupt antes de `ask_pantry`, no después**
LangGraph permite `interrupt_before` o `interrupt_after`. Usamos `interrupt_before` para que el nodo `ask_pantry` sea el punto de reanudación natural — el frontend inyecta `pantry_items` en el estado antes de que el nodo se ejecute.

**Dos endpoints de generación en lugar de uno con polling**
El agente puede tardar 30–60 segundos en completarse. Usar un interrupt explícito con `thread_id` es más limpio que un job en background con polling: el frontend sabe exactamente en qué estado está el grafo.

**SQLAlchemy Core sin ORM**
Las queries son pocas y simples. Usar SQL directo con `text()` es más legible que definir modelos ORM para una app de usuario único.

**Retry de presupuesto dentro del grafo**
El conditional edge `check_budget → generate_menu` evita exponer la lógica de reintento al frontend. El frontend siempre recibe un resultado final, nunca un "inténtalo de nuevo".

**Scraping + PDF como fuentes de ofertas**
El scraping puede romperse con cambios en el HTML del super; el PDF es el fallback. Ambas rutas escriben en la misma tabla `weekly_deals` con el mismo formato, por lo que el nodo `analyze_deals` es agnóstico a la fuente.

**`week_target` en el request de generación**
Un campo `"current"` / `"next"` en el request permite generar la semana siguiente sin tocar la actual. El backend calcula el `week_start` correspondiente y lo usa como clave en `weekly_menus`.

---

## Cómo levantar el sistema

```bash
# 1. Base de datos
createdb meal_planner
psql meal_planner < db/schema.sql

# 2. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # rellenar OLLAMA_API_KEY, HF_TOKEN, DATABASE_URL
uvicorn main:app --reload
# API: http://localhost:8000
# Docs: http://localhost:8000/docs

# 3. Frontend
cd frontend
npm install
npm run dev
# App: http://localhost:3000
```
