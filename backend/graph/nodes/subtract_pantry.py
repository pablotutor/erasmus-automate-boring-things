from ..state import MealPlannerState


def run(state: MealPlannerState) -> dict:
    pantry_names = {
        item["name"].lower()
        for item in state.get("pantry_items", [])
        if item.get("sufficient", True)
    }

    final_list = [
        ing for ing in state["ingredients"]
        if ing["name"].lower() not in pantry_names
    ]
    removed = [
        ing["name"] for ing in state["ingredients"]
        if ing["name"].lower() in pantry_names
    ]

    return {"final_list": final_list, "pantry_removed": removed}
