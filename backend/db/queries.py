import json
from datetime import date, timedelta
from sqlalchemy import text
from .client import engine


def get_all_meals(meal_type=None) -> list[dict]:
    with engine.connect() as conn:
        if meal_type:
            result = conn.execute(
                text("SELECT * FROM meals WHERE :t = ANY(meal_types) ORDER BY name"),
                {"t": meal_type},
            )
        else:
            result = conn.execute(text("SELECT * FROM meals ORDER BY name"))
        return [dict(row._mapping) for row in result]


def create_meal(data: dict) -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "INSERT INTO meals (name, meal_types, ingredients, tags, prep_time, description, image_url) "
                "VALUES (:name, :meal_types, :ingredients, :tags, :prep_time, :description, :image_url) RETURNING *"
            ),
            {
                "name":        data["name"],
                "meal_types":  data.get("meal_types", []),
                "ingredients": data.get("ingredients", []),
                "tags":        data.get("tags", []),
                "prep_time":   data.get("prep_time"),
                "description": data.get("description"),
                "image_url":   data.get("image_url"),
            },
        )
        conn.commit()
        return dict(result.fetchone()._mapping)


def update_meal(meal_id: int, data: dict) -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "UPDATE meals SET "
                "name = :name, meal_types = :meal_types, ingredients = :ingredients, "
                "tags = :tags, prep_time = :prep_time, description = :description, "
                "image_url = :image_url "
                "WHERE id = :id RETURNING *"
            ),
            {
                "id":          meal_id,
                "name":        data["name"],
                "meal_types":  data.get("meal_types", []),
                "ingredients": data.get("ingredients", []),
                "tags":        data.get("tags", []),
                "prep_time":   data.get("prep_time"),
                "description": data.get("description"),
                "image_url":   data.get("image_url"),
            },
        )
        conn.commit()
        row = result.fetchone()
        if row is None:
            raise ValueError(f"Meal {meal_id} not found")
        return dict(row._mapping)


def delete_meal(meal_id: int) -> None:
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM meals WHERE id = :id"), {"id": meal_id})
        conn.commit()


def get_pantry() -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM pantry ORDER BY item_name"))
        return [dict(row._mapping) for row in result]


def update_pantry(items: list[dict]) -> None:
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM pantry"))
        for item in items:
            conn.execute(
                text(
                    "INSERT INTO pantry (item_name, sufficient) "
                    "VALUES (:item_name, :sufficient)"
                ),
                item,
            )
        conn.commit()


def save_deals(supermarket: str, raw_text: str, expires_at: date | None = None) -> None:
    today = date.today()
    expiry = expires_at or (today + timedelta(days=6 - today.weekday()))  # próximo domingo
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO weekly_deals (week_start, expires_at, supermarket, raw_text) "
                "VALUES (:week_start, :expires_at, :supermarket, :raw_text) "
                "ON CONFLICT (week_start, supermarket) DO UPDATE "
                "SET raw_text = EXCLUDED.raw_text, expires_at = EXCLUDED.expires_at"
            ),
            {"week_start": today, "expires_at": expiry, "supermarket": supermarket, "raw_text": raw_text},
        )
        conn.commit()


def _this_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def get_current_week_menu() -> dict | None:
    monday = _this_monday()
    next_monday = monday + timedelta(days=7)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT menu_data, shopping_list, recommended_super, budget, estimated_cost, created_at, context
                FROM weekly_menus
                WHERE week_start >= :monday AND week_start < :next_monday
                ORDER BY created_at DESC LIMIT 1
            """),
            {"monday": monday, "next_monday": next_monday},
        ).fetchone()
    if row is None:
        return None
    r = dict(row._mapping)
    budget_val = float(r["budget"] or 0)
    estimated_val = float(r["estimated_cost"] or 0)
    return {
        "menu": r["menu_data"],
        "shopping_list": r["shopping_list"],
        "supermarket": {"recommended": r["recommended_super"] or "", "reasoning": ""},
        "budget_summary": {
            "budget": budget_val,
            "estimated": estimated_val,
            "remaining": round(budget_val - estimated_val, 2),
        },
        "created_at": str(r["created_at"]),
        "context": json.loads(r["context"]) if r["context"] else {},
    }


def get_next_week_menu() -> dict | None:
    monday = _this_monday() + timedelta(days=7)
    next_monday = monday + timedelta(days=7)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT menu_data, shopping_list, recommended_super, budget, estimated_cost, created_at, context
                FROM weekly_menus
                WHERE week_start >= :monday AND week_start < :next_monday
                ORDER BY created_at DESC LIMIT 1
            """),
            {"monday": monday, "next_monday": next_monday},
        ).fetchone()
    if row is None:
        return None
    r = dict(row._mapping)
    budget_val = float(r["budget"] or 0)
    estimated_val = float(r["estimated_cost"] or 0)
    return {
        "menu": r["menu_data"],
        "shopping_list": r["shopping_list"],
        "supermarket": {"recommended": r["recommended_super"] or "", "reasoning": ""},
        "budget_summary": {
            "budget": budget_val,
            "estimated": estimated_val,
            "remaining": round(budget_val - estimated_val, 2),
        },
        "created_at": str(r["created_at"]),
        "context": json.loads(r["context"]) if r["context"] else {},
    }


def save_menu(
    menu_data: dict,
    shopping_list: dict,
    budget: float,
    context: dict,
    estimated_cost: float,
    recommended_super: str,
    week_start: date | None = None,
) -> None:
    ws = week_start or _this_monday()
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO weekly_menus "
                "(week_start, context, budget, menu_data, shopping_list, recommended_super, estimated_cost) "
                "VALUES (:week_start, :context, :budget, :menu_data, :shopping_list, :recommended_super, :estimated_cost)"
            ),
            {
                "week_start": ws,
                "context": json.dumps(context, ensure_ascii=False),
                "budget": budget,
                "menu_data": json.dumps(menu_data, ensure_ascii=False),
                "shopping_list": json.dumps(shopping_list, ensure_ascii=False),
                "recommended_super": recommended_super,
                "estimated_cost": estimated_cost,
            },
        )
        conn.commit()


def update_menu(week_start: date, menu_data: dict, shopping_list: dict) -> bool:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                UPDATE weekly_menus
                SET menu_data = :menu_data, shopping_list = :shopping_list
                WHERE id = (
                    SELECT id FROM weekly_menus
                    WHERE week_start >= :ws AND week_start < :ws_end
                    ORDER BY created_at DESC LIMIT 1
                )
            """),
            {
                "menu_data": json.dumps(menu_data, ensure_ascii=False),
                "shopping_list": json.dumps(shopping_list, ensure_ascii=False),
                "ws": week_start,
                "ws_end": week_start + timedelta(days=7),
            },
        )
        conn.commit()
        return result.rowcount > 0


def patch_menu_meal(week: str, day: str, meal_type: str, meal_name: str) -> bool:
    if week == "current":
        current = get_current_week_menu()
        week_start = _this_monday()
    else:
        current = get_next_week_menu()
        week_start = _this_monday() + timedelta(days=7)
    if not current:
        return False
    menu = current["menu"]
    if day not in menu:
        menu[day] = {}
    menu[day][meal_type] = meal_name
    return update_menu(week_start, menu, current["shopping_list"])


def get_deals() -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT DISTINCT ON (supermarket) supermarket, raw_text
                FROM weekly_deals
                WHERE expires_at >= :today
                ORDER BY supermarket, uploaded_at DESC
            """),
            {"today": date.today()},
        )
        return {row.supermarket: row.raw_text for row in result}


def get_valid_deals_meta() -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT DISTINCT ON (supermarket) supermarket, expires_at, uploaded_at,
                       length(raw_text) AS chars
                FROM weekly_deals
                WHERE expires_at >= :today
                ORDER BY supermarket, uploaded_at DESC
            """),
            {"today": date.today()},
        )
        return [dict(row._mapping) for row in result]


def get_all_deals() -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, supermarket, week_start, expires_at, uploaded_at, length(raw_text) as chars FROM weekly_deals ORDER BY uploaded_at DESC")
        )
        return [dict(row._mapping) for row in result]


def get_all_menus() -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, week_start, budget, estimated_cost, recommended_super, created_at, menu_data, shopping_list FROM weekly_menus ORDER BY created_at DESC LIMIT 20")
        )
        return [dict(row._mapping) for row in result]


def get_recent_logs(limit: int = 100) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM node_logs ORDER BY created_at DESC LIMIT :limit"),
            {"limit": limit},
        )
        return [dict(row._mapping) for row in result]


def clear_deals() -> None:
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM weekly_deals WHERE week_start = :today"),
            {"today": date.today()},
        )
        conn.commit()


def save_node_log(
    thread_id: str,
    node: str,
    event: str,
    duration_ms: float | None = None,
    input: dict | None = None,
    output: dict | None = None,
    error: str | None = None,
    traceback: str | None = None,
    is_llm: bool = False,
) -> None:
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO node_logs
                    (thread_id, node, event, duration_ms, input, output, error, traceback, is_llm)
                VALUES
                    (:thread_id, :node, :event, :duration_ms, :input, :output, :error, :traceback, :is_llm)
            """),
            {
                "thread_id": thread_id,
                "node": node,
                "event": event,
                "duration_ms": duration_ms,
                "input": json.dumps(input, default=str) if input else None,
                "output": json.dumps(output, default=str) if output else None,
                "error": error,
                "traceback": traceback,
                "is_llm": is_llm,
            },
        )
        conn.commit()


def get_node_logs(thread_id: str) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM node_logs WHERE thread_id = :tid ORDER BY created_at"),
            {"tid": thread_id},
        )
        return [dict(row._mapping) for row in result]
