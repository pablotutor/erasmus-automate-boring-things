from db.queries import get_all_meals
from ..logger import log_node
from ..state import MealPlannerState


@log_node("filter_meals", is_llm=False)
def run(state: MealPlannerState) -> dict:
    context = state.get("context") or {}
    gym_days = context.get("gym_days", [])
    travel_days = context.get("travel_days", [])

    all_meals = get_all_meals()

    if travel_days:
        all_meals = [
            m for m in all_meals
            if "batch-cook" not in m.get("tags", []) or "dinner" not in m.get("meal_types", [])
        ]

    if gym_days:
        all_meals.sort(key=lambda m: "gym" in m.get("tags", []), reverse=True)

    return {"filtered_meals": all_meals}
