import json
from collections import Counter
from llm import get_llm
from ..state import MealPlannerState

llm = get_llm()

MAX_REPEATS = 2
MAX_LLM_RETRIES = 2

PROMPT = """Eres un planificador de comidas. Crea un menú semanal para el usuario.

CATÁLOGO DE PLATOS DISPONIBLES (ÚNICOS PLATOS QUE PUEDES USAR):
{meals_list}

CONTEXTO DE LA SEMANA:
- Presupuesto: €{budget}
- Días de entrenamiento (necesitan más proteína): {gym_days}
- Notas: {notes}
- Reintento nº {retry_count}: {retry_instruction}

REGLAS ESTRICTAS — léelas todas antes de generar:

REGLA 1 — SOLO CATÁLOGO (MUY IMPORTANTE):
Usa ÚNICAMENTE los platos que aparecen en el catálogo de arriba, copiando el nombre exactamente igual.
PROHIBIDO inventar platos nuevos. Si un plato no está en el catálogo, no lo uses.
El campo "ai_generated_meals" debe estar siempre vacío: [].

REGLA 2 — DÍAS DE VIAJE (MUY IMPORTANTE):
{travel_rule}
TODOS los demás días que NO están en la lista de viaje, el usuario está en casa y SÍ cocina. Pon platos en esos días.

REGLA 3 — DÍAS DE GYM:
En días {gym_days} prioriza platos con tag "gym" en lunch o dinner.

REGLA 4 — VARIEDAD (MUY IMPORTANTE):
Ningún plato puede aparecer más de {max_repeats} veces en toda la semana.
Cuenta mentalmente cuántas veces usas cada plato antes de terminar.

REGLA 5 — COSTE:
Reutiliza ingredientes entre días. Estima el coste total semanal en euros.

Devuelve SOLO JSON, sin markdown, sin explicaciones:
{{
  "menu": {{
    "monday":    {{"breakfast": "nombre exacto del catálogo o null", "lunch": "nombre exacto o null", "dinner": "nombre exacto o null"}},
    "tuesday":   {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
    "wednesday": {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
    "thursday":  {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
    "friday":    {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
    "saturday":  {{"breakfast": "...", "lunch": "...", "dinner": "..."}},
    "sunday":    {{"breakfast": "...", "lunch": "...", "dinner": "..."}}
  }},
  "ai_generated_meals": [],
  "estimated_cost": 47.50
}}"""


_DAY_KEYS = {
    "monday": "mon", "tuesday": "tue", "wednesday": "wed",
    "thursday": "thu", "friday": "fri", "saturday": "sat", "sunday": "sun",
}
_MEAL_TYPES = ["breakfast", "lunch", "dinner"]


def _count_repeats(menu: dict) -> dict[str, int]:
    names = [
        name
        for day_data in menu.values()
        for name in day_data.values()
        if name
    ]
    return dict(Counter(names))


def _violations(menu: dict) -> list[str]:
    return [name for name, count in _count_repeats(menu).items() if count > MAX_REPEATS]


def _fix_repeats(menu: dict, filtered_meals: list, travel_days: list) -> dict:
    """Reemplaza en Python los platos que superen MAX_REPEATS."""
    by_type: dict[str, list[str]] = {"breakfast": [], "lunch": [], "dinner": []}
    for m in filtered_meals:
        mt = m.get("meal_type", "")
        if mt in by_type:
            by_type[mt].append(m["name"])

    counts = _count_repeats(menu)

    for day_name, abbr in _DAY_KEYS.items():
        if abbr in travel_days:
            continue
        day_data = menu[day_name]
        for meal_type in _MEAL_TYPES:
            name = day_data.get(meal_type)
            if name and counts.get(name, 0) > MAX_REPEATS:
                # Buscar sustituto del mismo tipo con menos usos
                substitute = next(
                    (
                        n for n in by_type[meal_type]
                        if counts.get(n, 0) < MAX_REPEATS and n != name
                    ),
                    None,
                )
                if substitute:
                    counts[name] = counts.get(name, 0) - 1
                    counts[substitute] = counts.get(substitute, 0) + 1
                    day_data[meal_type] = substitute
        menu[day_name] = day_data

    return menu


def _fix_home_days(menu: dict, travel_days: list, filtered_meals: list) -> dict:
    """Rellena nulls en días de casa y fuerza null en días de viaje."""
    by_type: dict[str, list[str]] = {"breakfast": [], "lunch": [], "dinner": []}
    for m in filtered_meals:
        mt = m.get("meal_type", "")
        if mt in by_type:
            by_type[mt].append(m["name"])

    used: dict[str, int] = {}
    for day_data in menu.values():
        for name in day_data.values():
            if name:
                used[name] = used.get(name, 0) + 1

    def pick(meal_type: str, exclude: list[str]) -> str | None:
        for name in by_type[meal_type]:
            if used.get(name, 0) < MAX_REPEATS and name not in exclude:
                used[name] = used.get(name, 0) + 1
                return name
        candidates = by_type[meal_type]
        if candidates:
            name = min(candidates, key=lambda n: used.get(n, 0))
            used[name] = used.get(name, 0) + 1
            return name
        return None

    for day_name, abbr in _DAY_KEYS.items():
        if abbr in travel_days:
            menu[day_name] = {"breakfast": None, "lunch": None, "dinner": None}
            continue
        day_data = menu.get(day_name, {})
        day_meals = [v for v in day_data.values() if v]
        for meal_type in _MEAL_TYPES:
            if not day_data.get(meal_type):
                filled = pick(meal_type, exclude=day_meals)
                day_data[meal_type] = filled
                if filled:
                    day_meals.append(filled)
        menu[day_name] = day_data

    return menu


def run(state: MealPlannerState) -> dict:
    meals_list = "\n".join([
        f"- [{m['meal_type']}] {m['name']} | ingredientes: {', '.join(m['ingredients'])} | tags: {', '.join(m['tags'])}"
        for m in state["filtered_meals"]
    ])

    retry_count = state.get("retry_count") or 0
    retry_instruction = (
        f"El menú anterior costaba €{state.get('estimated_cost', 0):.2f}, supera el presupuesto. Reduce el coste."
        if retry_count > 0 else "Primera generación."
    )

    context = state.get("context") or {}
    travel_days = context.get("travel_days", [])
    all_days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    home_days = [d for d in all_days if d not in travel_days]

    if travel_days:
        travel_rule = (
            f"Días de VIAJE (fuera de casa, NO cocina): {travel_days} → breakfast: null, lunch: null, dinner: null.\n"
            f"Días en CASA (SÍ cocina, pon platos): {home_days}."
        )
    else:
        travel_rule = f"No hay días de viaje. El usuario está en casa los 7 días: {all_days}. Pon platos en TODOS ellos."

    prompt_kwargs = dict(
        meals_list=meals_list,
        budget=state["budget"],
        gym_days=context.get("gym_days", []) or "ninguno",
        travel_rule=travel_rule,
        notes=context.get("notes", "ninguna"),
        retry_count=retry_count,
        max_repeats=MAX_REPEATS,
    )

    menu = None
    estimated_cost = 0.0

    for attempt in range(MAX_LLM_RETRIES + 1):
        bad_meals = [] if menu is None else _violations(menu)
        if attempt == 0:
            prompt_kwargs["retry_instruction"] = retry_instruction
        else:
            prompt_kwargs["retry_instruction"] = (
                f"REINTENTO {attempt} por repeticiones: los platos {bad_meals} "
                f"aparecen más de {MAX_REPEATS} veces. Sustitúyelos por otros del catálogo."
            )

        response = llm.invoke(PROMPT.format(**prompt_kwargs))
        parsed = json.loads(response.content)
        menu = parsed["menu"]
        estimated_cost = float(parsed["estimated_cost"])

        if not _violations(menu):
            break  # el LLM lo resolvió solo

    # Garantías Python: rellenar nulls en días de casa y corregir repetidos residuales
    menu = _fix_home_days(menu, travel_days, state["filtered_meals"])
    menu = _fix_repeats(menu, state["filtered_meals"], travel_days)

    return {
        "menu": menu,
        "estimated_cost": estimated_cost,
        "retry_count": retry_count,
    }
