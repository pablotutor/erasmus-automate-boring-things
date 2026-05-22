from ..logger import log_node
from ..state import MealPlannerState


@log_node("ask_pantry", is_llm=False)
def run(state: MealPlannerState) -> dict:
    # El interrupt ocurre ANTES de este nodo (interrupt_before=["ask_pantry"]).
    # Cuando se reanuda, pantry_raw ya está en el state via aupdate_state.
    return {}
