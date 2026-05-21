from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import MealPlannerState
from .nodes import (
    parse_input,
    ask_pantry,
    parse_pantry,
    filter_meals,
    generate_menu,
    check_budget,
    extract_ingredients,
    subtract_pantry,
    analyze_deals,
    format_output,
)


def _should_retry_or_continue(state: MealPlannerState) -> str:
    if not state["budget_ok"] and state.get("retry_count", 0) < 2:
        return "generate_menu"
    return "extract_ingredients"


def build_graph():
    builder = StateGraph(MealPlannerState)

    builder.add_node("parse_input",         parse_input.run)
    builder.add_node("ask_pantry",          ask_pantry.run)
    builder.add_node("parse_pantry",        parse_pantry.run)
    builder.add_node("filter_meals",        filter_meals.run)
    builder.add_node("generate_menu",       generate_menu.run)
    builder.add_node("check_budget",        check_budget.run)
    builder.add_node("extract_ingredients", extract_ingredients.run)
    builder.add_node("subtract_pantry",     subtract_pantry.run)
    builder.add_node("analyze_deals",       analyze_deals.run)
    builder.add_node("format_output",       format_output.run)

    builder.set_entry_point("parse_input")
    builder.add_edge("parse_input",         "ask_pantry")
    builder.add_edge("ask_pantry",          "parse_pantry")
    builder.add_edge("parse_pantry",        "filter_meals")
    builder.add_edge("filter_meals",        "generate_menu")
    builder.add_edge("generate_menu",       "check_budget")
    builder.add_edge("extract_ingredients", "subtract_pantry")
    builder.add_edge("subtract_pantry",     "analyze_deals")
    builder.add_edge("analyze_deals",       "format_output")
    builder.add_edge("format_output",       END)

    builder.add_conditional_edges(
        "check_budget",
        _should_retry_or_continue,
        {
            "generate_menu":       "generate_menu",
            "extract_ingredients": "extract_ingredients",
        },
    )

    memory = MemorySaver()
    return builder.compile(
        checkpointer=memory,
        interrupt_before=["ask_pantry"],
    )


graph = build_graph()
