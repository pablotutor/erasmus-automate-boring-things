# Meal Planner — Erasmus Automate

Planificador de menús semanales con lista de compra y recomendación de supermercado.

## Docs

- [`docs/PRD.md`](docs/PRD.md) — Product Requirements Document
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Arquitectura y decisiones de diseño

## Setup rápido

### 1. Base de datos

```bash
createdb meal_planner
psql meal_planner < db/schema.sql
```

### 2. Ollama Cloud

```bash
# Crear API key en https://ollama.com → Settings → API Keys
# Luego en backend/.env:
# OLLAMA_API_KEY=tu_api_key
```

### 3. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
# → http://localhost:8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Stack

| Capa | Tech |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Agente | LangGraph + LangChain |
| LLM | Ollama Cloud (gpt-oss:120b) |
| DB | PostgreSQL local |
| Frontend | Next.js 14 + TailwindCSS |
