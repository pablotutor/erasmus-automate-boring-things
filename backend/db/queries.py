from datetime import date
from sqlalchemy import text
from .client import engine


def get_all_meals(meal_type=None) -> list[dict]:
    with engine.connect() as conn:
        if meal_type:
            result = conn.execute(
                text("SELECT * FROM meals WHERE meal_type = :t ORDER BY name"),
                {"t": meal_type},
            )
        else:
            result = conn.execute(text("SELECT * FROM meals ORDER BY name"))
        return [dict(row._mapping) for row in result]


def create_meal(data: dict) -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "INSERT INTO meals (name, meal_type, ingredients, tags, prep_time) "
                "VALUES (:name, :meal_type, :ingredients, :tags, :prep_time) RETURNING *"
            ),
            data,
        )
        conn.commit()
        return dict(result.fetchone()._mapping)


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


def save_deals(supermarket: str, raw_text: str) -> None:
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO weekly_deals (week_start, supermarket, raw_text) "
                "VALUES (:week_start, :supermarket, :raw_text) "
                "ON CONFLICT (week_start, supermarket) DO UPDATE SET raw_text = EXCLUDED.raw_text"
            ),
            {"week_start": date.today(), "supermarket": supermarket, "raw_text": raw_text},
        )
        conn.commit()


def get_deals() -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT supermarket, raw_text FROM weekly_deals WHERE week_start = :today"),
            {"today": date.today()},
        )
        return {row.supermarket: row.raw_text for row in result}


def clear_deals() -> None:
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM weekly_deals WHERE week_start = :today"),
            {"today": date.today()},
        )
        conn.commit()
