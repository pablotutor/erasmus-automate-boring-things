from typing import TypedDict, Optional


class MealPlannerState(TypedDict):
    # Input del usuario
    raw_input: str
    budget: float
    context: dict               # {gym_days: [...], travel_days: [...], notes: "..."}

    # Despensa
    pantry_raw: str
    pantry_items: list          # [{name, sufficient}]

    # Catálogo filtrado
    filtered_meals: list

    # Menú generado
    menu: dict                  # {monday: {breakfast, lunch, dinner}}
    estimated_cost: float
    budget_ok: bool
    retry_count: int

    # Lista de compra
    ingredients: list           # [{name, times_used, category, quantity, unit}]
    final_list: list
    pantry_removed: list

    # Ofertas
    deals_text: dict            # {billa: "texto raw...", ...}
    deals: dict                 # {billa: ["producto1", ...], ...}
    recommended_super: str
    super_reasoning: str

    # Output final
    final_output: dict
