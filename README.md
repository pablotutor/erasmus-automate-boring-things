# Erasmus Automate — AI Meal Planner

Planificador de menús semanales impulsado por IA para estudiantes Erasmus. Genera un menú personalizado, lista de compra optimizada y recomendación de supermercado, teniendo en cuenta tu presupuesto, actividad física, despensa y las ofertas de la semana.

---

## Tabla de contenidos

- [Qué hace](#qué-hace)
- [Arquitectura](#arquitectura)
- [Agente LangGraph](#agente-langgraph)
- [API REST](#api-rest)
- [Frontend](#frontend)
- [Base de datos](#base-de-datos)
- [Setup](#setup)
- [Stack](#stack)

---

## Qué hace

1. **Catálogo de platos** — gestiona tu biblioteca personal de recetas con nombre, ingredientes, tags, tiempo de preparación e imagen (subida manualmente o generada por IA).
2. **Ofertas de supermercado** — scraping automático de Billa y Hofer (Austria), o subida de PDF con el folleto semanal. Las ofertas se guardan en base de datos y expiran automáticamente al final de la semana.
3. **Generación de menú con IA** — un agente LangGraph multi-step genera el menú de la semana actual o la siguiente, con estos inputs:
   - Presupuesto semanal en euros
   - Días de deporte (calistenia / running / fútbol)
   - Días fuera de casa
   - Notas libres
4. **Despensa interactiva** — el agente pausa a mitad de la ejecución para preguntarte qué tienes en casa; puedes editar la respuesta antes de continuar.
5. **Lista de compra** — el agente descuenta lo que ya tienes en despensa y cruza con las ofertas del supermercado para recomendarte dónde comprar.
6. **Menú editable** — desde la interfaz puedes cambiar manualmente cualquier plato de cualquier día (semana actual o siguiente) y la lista de compra se actualiza en tiempo real.

---

## Arquitectura

```
erasmus-automate/
├── backend/              # FastAPI + LangGraph
│   ├── main.py           # Endpoints REST
│   ├── llm.py            # Wrapper Ollama Cloud (gpt-oss:120b)
│   ├── scraper.py        # Scraping Billa / Hofer
│   ├── db/
│   │   ├── client.py     # SQLAlchemy engine
│   │   └── queries.py    # Todas las queries a PostgreSQL
│   └── graph/
│       ├── graph.py      # Definición del grafo LangGraph
│       ├── logger.py     # Logging por nodo y thread
│       ├── state.py      # Tipado del estado compartido
│       └── nodes/        # Un fichero por nodo del agente
│           ├── parse_input.py
│           ├── ask_pantry.py
│           ├── parse_pantry.py
│           ├── filter_meals.py
│           ├── generate_menu.py
│           ├── check_budget.py
│           ├── extract_ingredients.py
│           ├── subtract_pantry.py
│           ├── analyze_deals.py
│           └── format_output.py
├── frontend/             # Next.js 14 + TailwindCSS
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx      # Shell con tabs: Mis platos / Ofertas / Agente
│   ├── components/
│   │   ├── MisPlatos.tsx     # CRUD catálogo + generación de imagen IA
│   │   ├── Ofertas.tsx       # Gestión de ofertas semanales
│   │   ├── DealsUpload.tsx   # Subida de PDF de folletos
│   │   ├── Agente.tsx        # Flujo completo del agente (calendario, despensa, resultado)
│   │   ├── GenerateForm.tsx  # Formulario de generación
│   │   ├── PantryStep.tsx    # Paso interactivo de despensa
│   │   └── ResultDisplay.tsx # Menú semanal editable + lista de compra
│   └── lib/
│       └── api.ts        # Funciones fetch hacia el backend
├── db/
│   └── schema.sql        # Esquema PostgreSQL + seed de platos
└── docs/
    ├── PRD.md
    └── ARCHITECTURE.md
```

---

## Agente LangGraph

El corazón de la aplicación es un grafo LangGraph con checkpoint en memoria que permite pausar la ejecución a mitad del flujo para recoger input del usuario (despensa).

```
parse_input
    │
ask_pantry          ← interrupt_before aquí (espera confirmación del usuario)
    │
parse_pantry
    │
filter_meals        ← filtra del catálogo según tipo de día (deporte / viaje / normal)
    │
generate_menu       ← LLM genera el menú semanal
    │
check_budget ───────── si no cuadra el presupuesto (máx. 2 reintentos) ──► generate_menu
    │
extract_ingredients
    │
subtract_pantry     ← descuenta lo que ya tienes en casa
    │
analyze_deals       ← cruza la lista de compra con las ofertas de la semana
    │
format_output       ← construye el JSON final con menú, lista y supermercado recomendado
```

El flujo se ejecuta en **dos llamadas HTTP separadas**:
- `POST /api/generate/start` — arranca el grafo y lo pausa en `ask_pantry`, devuelve `thread_id` y el estado actual de la despensa.
- `POST /api/generate/resume` — reanuda el grafo con la despensa editada por el usuario y lo lleva hasta el final.

También existe `POST /api/generate/adjust` para regenerar un menú parcheando manualmente un plato concreto de un día.

---

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/generate/start` | Inicia el agente, pausa en despensa |
| `POST` | `/api/generate/resume` | Reanuda el agente con la despensa confirmada |
| `POST` | `/api/generate/adjust` | Ajusta manualmente un plato del menú |
| `GET`  | `/api/menus/current` | Menú de la semana actual |
| `GET`  | `/api/menus/next` | Menú de la semana siguiente |
| `PATCH`| `/api/menus/{week}/meal` | Edita un plato concreto del menú |
| `GET`  | `/api/meals` | Lista el catálogo de platos |
| `POST` | `/api/meals` | Crea un plato |
| `PUT`  | `/api/meals/{id}` | Edita un plato |
| `DELETE`| `/api/meals/{id}` | Elimina un plato |
| `POST` | `/api/meals/{id}/image` | Sube imagen para un plato |
| `POST` | `/api/meals/generate-image` | Genera imagen IA para un plato |
| `POST` | `/api/meals/suggest` | LLM sugiere nuevos platos |
| `GET`  | `/api/pantry` | Lee el estado de la despensa |
| `PUT`  | `/api/pantry` | Actualiza la despensa |
| `POST` | `/api/deals/scrape/{supermarket}` | Scraping de ofertas (billa / hofer) |
| `POST` | `/api/deals/upload-pdf/{supermarket}` | Sube PDF de ofertas |
| `GET`  | `/api/deals` | Lista las ofertas activas |
| `DELETE`| `/api/deals` | Limpia las ofertas |
| `GET`  | `/api/logs/{thread_id}` | Logs de ejecución nodo a nodo |
| `GET`  | `/api/health` | Health check |

---

## Frontend

La aplicación tiene una sola página con tres pestañas:

### Mis platos
- Tabla con todos tus platos: nombre, tipos de comida, ingredientes, tags, tiempo de prep.
- Crear / editar / eliminar platos.
- Subir imagen propia o generar una con IA (Hugging Face Inference API).
- Botón "Sugerir platos" que pide al LLM nuevas ideas y las añade al catálogo con un clic.

### Ofertas
- Muestra las ofertas activas de la semana con su supermercado y fecha de expiración.
- Botón de scraping por supermercado (Billa / Hofer).
- Subida de PDF con el folleto semanal (`DealsUpload`).
- Borrar todas las ofertas.

### Agente
El flujo completo en tres pasos visuales:

1. **Configurar semana** — formulario con presupuesto, selector de actividades por día (calistenia / running / fútbol / viaje) y notas libres. Selector de semana actual o siguiente.
2. **Confirmar despensa** — el agente pausa y muestra qué tienes en casa. Puedes editar antes de continuar.
3. **Resultado** — menú semanal completo (desayuno / comida / cena por día), lista de compra optimizada, supermercado recomendado y coste estimado. Cada plato es reemplazable manualmente con un selector.

---

## Base de datos

PostgreSQL con cuatro tablas:

| Tabla | Descripción |
|-------|-------------|
| `meals` | Catálogo de platos (nombre, tipos, ingredientes, tags, imagen, etc.) |
| `pantry` | Estado de la despensa (items + si hay suficiente) |
| `weekly_menus` | Historial de menús generados por semana |
| `weekly_deals` | Ofertas de supermercado (expiran automáticamente al final de la semana) |

---

## Setup

### 1. Base de datos

```bash
createdb meal_planner
psql meal_planner < db/schema.sql
```

### 2. Variables de entorno del backend

```bash
cd backend
cp .env.example .env
```

Rellena en `.env`:

```
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=tu_api_key          # Settings → API Keys en ollama.com
OLLAMA_MODEL=gpt-oss:120b
DATABASE_URL=postgresql://localhost/meal_planner
HF_TOKEN=tu_token_huggingface      # Solo para generación de imágenes IA
```

### 3. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000
# → Docs: http://localhost:8000/docs
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 + FastAPI |
| Agente IA | LangGraph + checkpoint en memoria |
| LLM | Ollama Cloud (`gpt-oss:120b`) |
| Generación de imágenes | Hugging Face Inference API |
| Base de datos | PostgreSQL + SQLAlchemy |
| Scraping | httpx + BeautifulSoup4 |
| Frontend | Next.js 14 + TailwindCSS |
| Tipado | TypeScript (frontend) + Pydantic (backend) |
