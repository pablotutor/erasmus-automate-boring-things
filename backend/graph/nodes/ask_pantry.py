from ..state import MealPlannerState


def run(state: MealPlannerState) -> dict:
    # El interrupt ocurre ANTES de este nodo (interrupt_before=["ask_pantry"]).
    # Cuando se reanuda, pantry_raw ya está en el state via aupdate_state.
    return {}
