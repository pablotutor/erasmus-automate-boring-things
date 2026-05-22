from ..logger import log_node
from ..state import MealPlannerState


@log_node("check_budget", is_llm=False)
def run(state: MealPlannerState) -> dict:
    budget_ok = state["estimated_cost"] <= state["budget"] * 1.05  # 5% de margen
    current_retries = state.get("retry_count") or 0
    return {
        "budget_ok": budget_ok,
        "retry_count": current_retries + (0 if budget_ok else 1),
    }
