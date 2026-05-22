import json
from llm import get_llm
from ..logger import log_node
from ..state import MealPlannerState

llm = get_llm()

PROMPT = """Tienes toda la información de la semana. Genera el output final estructurado.

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
}}"""


@log_node("format_output", is_llm=True)
def run(state: MealPlannerState) -> dict:
    response = llm.invoke(PROMPT.format(
        menu=json.dumps(state["menu"], ensure_ascii=False),
        final_list=json.dumps(state.get("final_list", []), ensure_ascii=False),
        pantry_removed=json.dumps(state.get("pantry_removed", []), ensure_ascii=False),
        recommended_super=state.get("recommended_super", ""),
        super_reasoning=state.get("super_reasoning", ""),
        budget=state["budget"],
        estimated_cost=state.get("estimated_cost", 0),
    ))

    parsed = json.loads(response.content)
    return {"final_output": parsed}
