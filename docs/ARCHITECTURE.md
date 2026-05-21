# Architecture — Meal Planner Agent

## Overview

Sistema de planificación de menús semanales con lista de compra automatizada. Un agente LangGraph orquesta varios LLMs (Ollama local) y lógica Python pura para generar un menú personalizado, deducir la despensa, y recomendar el supermercado con mejores ofertas esa semana.

---

## Diagrama de flujo del grafo

```
[START]
   │
   ▼
parse_input          ← LLM: texto libre → {budget, context}
   │
   ▼
ask_pantry           ← INTERRUPT: espera respuesta del usuario
   │
   ▼
parse_pantry         ← LLM: texto libre → [{name, sufficient}]
   │
   ▼
filter_meals         ← Python: query PostgreSQL con tags
   │
   ▼
generate_menu        ← LLM: elige platos del catálogo → menú 7 días
   │
   ▼
check_budget         ← Python: estimated_cost <= budget * 1.05?
   │
   ├─── NO (retry_count < 2) ──► generate_menu (vuelve a intentar)
   │
   └─── SÍ ──►
               extract_ingredients  ← Python: deduplica ingredientes del menú
                  │
                  ▼
               subtract_pantry      ← Python: descuenta lo que hay en casa
                  │
                  ▼
               analyze_deals        ← LLM: analiza docs de ofertas → recomienda super
                  │
                  ▼
               format_output        ← LLM: ensambla output final estructurado
                  │
                  ▼
              [END]
```

---

## Componentes

### Backend (FastAPI + LangGraph)

| Archivo | Responsabilidad |
|---|---|
| `main.py` | FastAPI app, todos los endpoints |
| `graph/state.py` | `MealPlannerState` TypedDict — el estado compartido entre nodos |
| `graph/graph.py` | Construye y compila el grafo con interrupt y conditional edge |
| `graph/nodes/parse_input.py` | LLM: convierte texto libre en contexto estructurado |
| `graph/nodes/ask_pantry.py` | INTERRUPT: nodo vacío, el interrupt ocurre antes de él |
| `graph/nodes/parse_pantry.py` | LLM: extrae inventario de despensa de texto libre |
| `graph/nodes/filter_meals.py` | Python: filtra platos de la DB según contexto semanal |
| `graph/nodes/generate_menu.py` | LLM: elige platos y construye menú de 7 días |
| `graph/nodes/check_budget.py` | Python: valida coste vs presupuesto, dispara retry |
| `graph/nodes/extract_ingredients.py` | Python: agrega y deduplica ingredientes del menú |
| `graph/nodes/subtract_pantry.py` | Python: elimina de la lista lo que ya tienes en casa |
| `graph/nodes/analyze_deals.py` | LLM: analiza texto de folletos → recomienda supermercado |
| `graph/nodes/format_output.py` | LLM: ensambla el output final para el frontend |
| `db/client.py` | SQLAlchemy engine + session factory |
| `db/queries.py` | Todas las queries, devuelven listas de dicts |

### Database (PostgreSQL local)

| Tabla | Contenido |
|---|---|
| `meals` | Catálogo personal de platos |
| `pantry` | Items en casa ahora mismo |
| `weekly_menus` | Historial de menús generados |
| `weekly_deals` | Textos de folletos subidos por el usuario |

### Frontend (Next.js 14 + TailwindCSS)

MVP: una sola página con el flujo completo.

| Componente | Función |
|---|---|
| `app/page.tsx` | Página única, orquesta el flujo de 3 pasos |
| `components/GenerateForm.tsx` | Formulario inicial (contexto semanal) |
| `components/PantryStep.tsx` | Pregunta de despensa |
| `components/DealsUpload.tsx` | Upload manual de texto de ofertas |
| `components/ResultDisplay.tsx` | Muestra el resultado (JSON raw en MVP) |
| `lib/api.ts` | Cliente HTTP hacia FastAPI |

---

## Flujo de datos por endpoint

### Flujo principal (generación)

```
POST /api/generate/start  { raw_input }
  → graph.ainvoke hasta interrupt
  → returns { thread_id, question }

POST /api/generate/resume { thread_id, pantry_raw }
  → graph.aupdate_state + graph.ainvoke
  → returns final_output
```

### Upload de ofertas (previo a generación)

```
POST /api/deals/upload  { supermarket, text }
  → INSERT INTO weekly_deals
  → returns { ok: true }
```

---

## Decisiones clave

- **Ollama local**: cero coste, cero dependencias externas. Si la calidad JSON es inconsistente, ajustar el modelo o añadir retry en el parsing.
- **PostgreSQL local**: migrable a cualquier Postgres hosted con solo cambiar `DATABASE_URL`.
- **Upload manual de ofertas**: más robusto que scraping, que requiere mantenimiento continuo de selectores CSS.
- **Interrupt en ask_pantry**: LangGraph permite pausar el grafo y reanudar con nuevo estado — imprescindible para el flujo conversacional.
- **Conditional edge en check_budget**: hasta 2 reintentos de generación si el menú supera el presupuesto.

---

## Cómo levantar el sistema

```bash
# 1. Base de datos
createdb meal_planner
psql meal_planner < db/schema.sql

# 2. Ollama
ollama pull llama3.1:8b
ollama serve

# 3. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload

# 4. Frontend
cd frontend
npm install
npm run dev
```
