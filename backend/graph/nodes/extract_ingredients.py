from collections import defaultdict
from ..state import MealPlannerState

CATEGORIES = {
    "vegetables": ["spinach", "carrot", "onion", "tomato", "lettuce", "pepper", "garlic", "potato"],
    "proteins":   ["chicken", "salmon", "tuna", "eggs", "lentils", "beef"],
    "dairy":      ["milk", "yogurt", "butter", "cheese"],
    "grains":     ["rice", "pasta", "bread", "oats", "granola"],
    "pantry":     ["olive oil", "salt", "honey", "tomato sauce", "lemon"],
}


def categorize(ingredient: str) -> str:
    ing = ingredient.lower()
    for category, items in CATEGORIES.items():
        if any(item in ing for item in items):
            return category
    return "other"


def run(state: MealPlannerState) -> dict:
    menu = state["menu"]
    meals_db = {m["name"]: m for m in state["filtered_meals"]}

    all_ingredients: dict[str, int] = defaultdict(int)
    for day, meals in menu.items():
        for meal_type, meal_name in meals.items():
            if meal_name and meal_name in meals_db:
                for ing in meals_db[meal_name]["ingredients"]:
                    all_ingredients[ing.lower()] += 1

    ingredients = [
        {
            "name": name,
            "times_used": count,
            "category": categorize(name),
            "quantity": None,
            "unit": None,
        }
        for name, count in all_ingredients.items()
    ]
    ingredients.sort(key=lambda x: x["category"])
    return {"ingredients": ingredients}
