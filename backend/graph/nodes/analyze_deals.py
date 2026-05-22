import json
from llm import get_llm
from ..logger import log_node
from ..state import MealPlannerState

llm = get_llm()

PROMPT = """Tienes los folletos de ofertas de esta semana y la lista de compra del usuario.

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
Solo incluye en deals los supermercados para los que se proporcionó texto."""


@log_node("analyze_deals", is_llm=True)
def run(state: MealPlannerState) -> dict:
    deals_text = state.get("deals_text", {})

    if not deals_text:
        return {
            "deals": {},
            "recommended_super": "Sin datos",
            "super_reasoning": "No se subieron docs de ofertas esta semana.",
        }

    deals_formatted = "\n\n".join([
        f"=== {name.upper()} ===\n{text}"
        for name, text in deals_text.items()
    ])
    shopping_names = [item["name"] for item in state.get("final_list", [])]

    response = llm.invoke(PROMPT.format(
        shopping_list=", ".join(shopping_names),
        deals_text=deals_formatted,
    ))

    parsed = json.loads(response.content)
    return {
        "deals": parsed["deals"],
        "recommended_super": parsed["recommended"].capitalize(),
        "super_reasoning": parsed["reasoning"],
    }
