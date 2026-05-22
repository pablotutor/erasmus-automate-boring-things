import json
from llm import get_llm
from ..logger import log_node
from ..state import MealPlannerState

llm = get_llm()

PROMPT = """El usuario dice que tiene esto en casa: "{pantry_raw}"

Extrae cada item como ingrediente.
Si menciona "medio", "poco", "algo de" → sufficient: true igualmente.
Si dice "se me acabó" o "no tengo" → no incluyas ese item.
Normaliza los nombres en español, en singular y minúsculas.

Devuelve SOLO JSON:
{{
  "items": [
    {{"name": "sal",    "sufficient": true}},
    {{"name": "aceite", "sufficient": true}}
  ]
}}"""


@log_node("parse_pantry", is_llm=True)
def run(state: MealPlannerState) -> dict:
    response = llm.invoke(PROMPT.format(pantry_raw=state["pantry_raw"]))
    parsed = json.loads(response.content)
    return {"pantry_items": parsed["items"]}
