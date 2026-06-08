# Erasmus Automate — Product Requirements Document

> Documento de producto actualizado al estado real de la aplicación (junio 2026).

---

## 1. Contexto y objetivo

Aplicación personal de planificación de menús semanales con lista de compra automatizada.
Usuario único: estudiante de Erasmus en Viena.

**Problema que resuelve:**
- Perder tiempo decidiendo qué comer cada semana
- No aprovechar lo que ya tienes en casa
- No saber a qué supermercado ir para gastar menos con las ofertas de la semana

**Lo que hace el sistema:**
1. Mantiene un catálogo personal de recetas con imágenes, ingredientes y tags
2. Genera un menú semanal eligiendo del catálogo, teniendo en cuenta presupuesto, días de deporte y días de viaje
3. Pausa a mitad del proceso para confirmar qué tienes en casa (despensa interactiva)
4. Descuenta de la lista de compra lo que ya tienes en despensa
5. Analiza las ofertas semanales de Billa y Hofer (scraping automático o PDF subido) y recomienda dónde comprar
6. Permite editar manualmente cualquier plato del menú generado
7. Recuerda el menú de la semana actual y el de la siguiente semana por separado

---

## 2. Usuarios y casos de uso

**Usuario único:** Pablo, estudiante Erasmus en Viena, presupuesto semanal ~€50.

| Caso de uso | Frecuencia |
|-------------|-----------|
| Generar menú semanal | 1x por semana |
| Actualizar ofertas del supermercado | 1x por semana |
| Gestionar catálogo de platos | Esporádico |
| Editar plato concreto del menú | Según necesidad |
| Consultar lista de compra | Varios días a la semana |

---

## 3. Funcionalidades

### 3.1 Catálogo de platos (`Mis platos`)

- **CRUD completo**: crear, editar, eliminar platos
- **Campos**: nombre, tipos de comida (desayuno / comida / cena, multichoice), ingredientes, tags, tiempo de preparación, descripción, imagen
- **Imagen**: subida manual o generada por IA (Hugging Face Inference API)
- **Sugerencias IA**: el LLM propone nuevos platos según el catálogo actual; se añaden con un clic
- **Tags disponibles**: `gym`, `quick`, `cheap`, `batch-cook`, `travel`

### 3.2 Ofertas semanales (`Ofertas`)

- **Scraping automático**: Billa y Hofer (Austria) — extrae nombres de productos de sus páginas de ofertas
- **Subida de PDF**: el usuario sube el folleto semanal del super y el sistema extrae el texto con `pdfplumber`
- **Persistencia semanal**: las ofertas se guardan en BD con fecha de expiración (fin de semana); se eliminan automáticamente la semana siguiente
- **Gestión**: ver ofertas activas, eliminar y volver a subir para la semana nueva

### 3.3 Generación de menú con IA (`Agente`)

Flujo en tres pasos visuales:

**Paso 1 — Configurar semana**
- Presupuesto semanal en euros (€10–€500)
- Selector de días por actividad: calistenia / running / fútbol / viaje
- Notas libres adicionales
- Selector: semana actual o semana siguiente

**Paso 2 — Confirmar despensa**
- El agente pausa y muestra el estado actual de la despensa (guardado en BD)
- El usuario edita la lista antes de continuar
- El agente reanuda desde donde lo dejó (checkpoint LangGraph)

**Paso 3 — Resultado**
- Menú completo: desayuno, comida y cena para los 7 días
- Lista de compra por categorías (verduras, proteínas, lácteos, cereales, otros)
- Items de despensa excluidos de la lista
- Supermercado recomendado con razonamiento
- Coste estimado vs presupuesto
- Botón de reemplazo manual por plato: selector de platos del catálogo

### 3.4 Edición manual del menú

- Desde la vista de resultado, cada plato tiene un desplegable para cambiarlo
- El cambio se persiste en BD (`PATCH /api/menus/{week}/meal`)
- La lista de compra no se recalcula automáticamente (es un reemplazo visual)

---

## 4. Stack técnico

| Capa | Tecnología | Motivo |
|------|-----------|--------|
| Backend | Python 3.11 + FastAPI | Rápido de iterar, tipado con Pydantic |
| Agente IA | LangGraph + checkpoint en memoria | Permite pausar el grafo (interrupt) y reintentos condicionales |
| LLM | Ollama Cloud (`gpt-oss:120b`) | Modelo grande cloud sin configurar infraestructura local |
| Generación de imágenes | Hugging Face Inference API | Genera imagen de plato desde nombre + descripción |
| Base de datos | PostgreSQL local + SQLAlchemy core | Sin dependencias externas, migrable con solo cambiar DATABASE_URL |
| Scraping | httpx + BeautifulSoup4 | Ligero, sin Selenium |
| PDF | pdfplumber | Extracción de texto de folletos PDF |
| Frontend | Next.js 14 + TailwindCSS + TypeScript | SSR mínimo, CSS utility-first |

**Variables de entorno:**
```env
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=tu_api_key
OLLAMA_MODEL=gpt-oss:120b
DATABASE_URL=postgresql://localhost/meal_planner
HF_TOKEN=tu_token_huggingface
```

---

## 5. Fuera de scope

- Multi-usuario y autenticación
- App móvil
- Autocompletar carrito en web de supermercado
- Integración con APIs oficiales de supermercados (no existen públicas)
- Cálculo nutricional preciso

---

## 6. Base de datos

### Schema

```sql
-- Catálogo personal de platos
CREATE TABLE meals (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    meal_types   TEXT[] NOT NULL DEFAULT '{}',   -- multichoice: breakfast, lunch, dinner
    ingredients  TEXT[] NOT NULL DEFAULT '{}',
    tags         TEXT[] NOT NULL DEFAULT '{}',
    prep_time    INTEGER,
    description  TEXT,
    image_url    TEXT,
    ai_generated BOOLEAN DEFAULT false,
    created_at   TIMESTAMP DEFAULT now()
);

-- Despensa (lo que tienes en casa ahora)
CREATE TABLE pantry (
    id         SERIAL PRIMARY KEY,
    item_name  TEXT NOT NULL UNIQUE,
    sufficient BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT now()
);

-- Menús generados (historial)
CREATE TABLE weekly_menus (
    id                SERIAL PRIMARY KEY,
    week_start        DATE NOT NULL,
    context           TEXT,
    budget            DECIMAL(6,2),
    menu_data         JSONB NOT NULL,
    shopping_list     JSONB,
    recommended_super TEXT,
    estimated_cost    DECIMAL(6,2),
    created_at        TIMESTAMP DEFAULT now()
);

-- Ofertas semanales (scraping o PDF)
CREATE TABLE weekly_deals (
    id          SERIAL PRIMARY KEY,
    week_start  DATE NOT NULL,
    expires_at  DATE NOT NULL,
    supermarket TEXT NOT NULL,
    raw_text    TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT now(),
    UNIQUE (week_start, supermarket)
);

-- Logs de ejecución por nodo del agente
CREATE TABLE node_logs (
    id        SERIAL PRIMARY KEY,
    thread_id TEXT NOT NULL,
    node_name TEXT NOT NULL,
    status    TEXT NOT NULL,   -- 'start' | 'end' | 'error'
    message   TEXT,
    ts        TIMESTAMP DEFAULT now()
);
```

### Tags y su significado

| Tag | Significado |
|-----|------------|
| `gym` | Alto en proteína, apto post-entrenamiento |
| `quick` | Menos de 20 minutos de preparación |
| `cheap` | Menos de ~€2 por ración |
| `batch-cook` | Se puede cocinar en cantidad y guardar |
| `travel` | No requiere cocinar o fácil de transportar |

---

## 7. Decisiones de producto

**¿Por qué scraping Y subida de PDF?**
El scraping de Billa/Hofer es rápido pero puede romperse si cambian el HTML. La subida de PDF es el fallback robusto. Tener los dos garantiza que siempre hay datos de ofertas.

**¿Por qué pausar el grafo en despensa en lugar de pedirla antes?**
Porque el agente ya ha procesado el input inicial cuando hace la pausa — el usuario ve el estado actual de su despensa en BD y solo tiene que confirmar o editar. Es menos fricción que un formulario vacío al inicio.

**¿Por qué Ollama Cloud en lugar de modelo local?**
`gpt-oss:120b` da outputs JSON mucho más consistentes que modelos de 8b locales, eliminando la mayoría de los fallos de parsing. El tradeoff es latencia de red vs. calidad.

**¿Por qué menú actual y próximo separados?**
El usuario planifica la próxima semana mientras todavía está ejecutando la actual. Tener los dos en BD con `week_start` como clave permite consultar y editar cada uno de forma independiente.
