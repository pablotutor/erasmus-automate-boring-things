from ..logger import log_node
from ..state import MealPlannerState


@log_node("parse_input", is_llm=False)
def run(state: MealPlannerState) -> dict:
    # budget y context ya vienen estructurados desde el formulario.
    # LangGraph requiere escribir al menos un campo, devolvemos los que ya están.
    return {
        "budget": state.get("budget") or 50.0,
        "context": state.get("context") or {},
    }
