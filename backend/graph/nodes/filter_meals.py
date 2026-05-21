from db.queries import get_all_meals
from ..state import MealPlannerState


def run(state: MealPlannerState) -> dict:
    context = state.get("context") or {}
    gym_days = context.get("gym_days", [])
    travel_days = context.get("travel_days", [])

    all_meals = get_all_meals()

    if travel_days:
        all_meals = [
            m for m in all_meals
            if "batch-cook" not in m.get("tags", []) or m["meal_type"] != "dinner"
        ]

    if gym_days:
        all_meals.sort(key=lambda m: "gym" in m.get("tags", []), reverse=True)

    return {"filtered_meals": all_meals}
