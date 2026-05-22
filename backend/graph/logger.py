import json
import logging
import time
import traceback as tb
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
from logging.handlers import RotatingFileHandler
from pathlib import Path

from db.queries import save_node_log

_thread_id: ContextVar[str] = ContextVar("thread_id", default="unknown")

_logger = logging.getLogger("agent")


def set_thread_id(tid: str) -> None:
    _thread_id.set(tid)


def setup_logging() -> None:
    if _logger.handlers:
        return
    _logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(message)s")

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    _logger.addHandler(ch)

    log_dir = Path(__file__).parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    fh = RotatingFileHandler(log_dir / "agent.log", maxBytes=10_000_000, backupCount=5)
    fh.setFormatter(fmt)
    _logger.addHandler(fh)


def _safe_serialize(obj, max_str: int = 500, max_list: int = 20):
    if isinstance(obj, dict):
        return {k: _safe_serialize(v, max_str, max_list) for k, v in obj.items()}
    if isinstance(obj, list):
        result = [_safe_serialize(i, max_str, max_list) for i in obj[:max_list]]
        if len(obj) > max_list:
            result.append(f"... ({len(obj) - max_list} more items)")
        return result
    if isinstance(obj, str) and len(obj) > max_str:
        return obj[:max_str] + f"… [{len(obj)} chars total]"
    return obj


def _emit(event: str, node: str, extra: dict) -> str:
    tid = _thread_id.get()
    record = {
        "event": event,
        "node": node,
        "thread_id": tid,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    _logger.info(json.dumps(record, ensure_ascii=False, default=str))
    return tid


def log_node(name: str, is_llm: bool = False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(state):
            tid = _emit("NODE_START", name, {"is_llm": is_llm})
            save_node_log(tid, name, "NODE_START", is_llm=is_llm)
            t0 = time.perf_counter()
            try:
                result = fn(state)
                duration = round((time.perf_counter() - t0) * 1000, 2)
                safe_in = _safe_serialize(dict(state))
                safe_out = _safe_serialize(result or {})
                _emit("NODE_END", name, {
                    "duration_ms": duration,
                    "is_llm": is_llm,
                    "input": safe_in,
                    "output": safe_out,
                })
                save_node_log(
                    tid, name, "NODE_END",
                    duration_ms=duration,
                    input=safe_in,
                    output=safe_out,
                    is_llm=is_llm,
                )
                return result
            except Exception as e:
                duration = round((time.perf_counter() - t0) * 1000, 2)
                safe_in = _safe_serialize(dict(state))
                _emit("NODE_ERROR", name, {
                    "duration_ms": duration,
                    "is_llm": is_llm,
                    "input": safe_in,
                    "error": str(e),
                    "traceback": tb.format_exc(),
                })
                save_node_log(
                    tid, name, "NODE_ERROR",
                    duration_ms=duration,
                    input=safe_in,
                    error=str(e),
                    traceback=tb.format_exc(),
                    is_llm=is_llm,
                )
                raise
        return wrapper
    return decorator
