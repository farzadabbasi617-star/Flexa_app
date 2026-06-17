from __future__ import annotations

import csv
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import BASE_DIR, settings


DB_PATH = settings.db_path if settings.db_path.is_absolute() else BASE_DIR / settings.db_path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table});").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER NOT NULL UNIQUE,
                flexa_id TEXT,
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                game TEXT NOT NULL,
                platform TEXT NOT NULL,
                gamer_tag TEXT NOT NULL,
                city TEXT,
                team_name TEXT,
                status TEXT NOT NULL DEFAULT 'registered',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
            );
            """
        )
        # Lightweight migration for databases created by the generic MVP.
        _ensure_column(conn, "registrations", "flexa_id", "TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_game ON registrations(game);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_flexa_id ON registrations(flexa_id);")


def upsert_user(user: Any) -> None:
    now = utc_now()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (telegram_id, username, first_name, last_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
                username=excluded.username,
                first_name=excluded.first_name,
                last_name=excluded.last_name,
                updated_at=excluded.updated_at;
            """,
            (
                user.id,
                getattr(user, "username", None),
                getattr(user, "first_name", None),
                getattr(user, "last_name", None),
                now,
                now,
            ),
        )


def save_registration(telegram_id: int, data: dict[str, Any]) -> None:
    now = utc_now()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO registrations
                (telegram_id, flexa_id, full_name, phone, game, platform, gamer_tag, city, team_name, status, created_at, updated_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
                flexa_id=excluded.flexa_id,
                full_name=excluded.full_name,
                phone=excluded.phone,
                game=excluded.game,
                platform=excluded.platform,
                gamer_tag=excluded.gamer_tag,
                city=excluded.city,
                team_name=excluded.team_name,
                status='registered',
                updated_at=excluded.updated_at;
            """,
            (
                telegram_id,
                data.get("flexa_id") or "",
                data["full_name"],
                data["phone"],
                data["game"],
                data["platform"],
                data["gamer_tag"],
                data.get("city") or "",
                data.get("team_name") or "",
                now,
                now,
            ),
        )


def cancel_registration(telegram_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            """
            UPDATE registrations
            SET status='cancelled', updated_at=?
            WHERE telegram_id=? AND status='registered';
            """,
            (utc_now(), telegram_id),
        )
        return cur.rowcount > 0


def get_registration(telegram_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT r.*, u.username, u.first_name, u.last_name
            FROM registrations r
            LEFT JOIN users u ON u.telegram_id = r.telegram_id
            WHERE r.telegram_id=?
            ORDER BY r.updated_at DESC
            LIMIT 1;
            """,
            (telegram_id,),
        ).fetchone()
    return dict(row) if row else None


def get_stats() -> dict[str, Any]:
    with get_conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM registrations WHERE status='registered';"
        ).fetchone()["c"]
        with_flexa_id = conn.execute(
            "SELECT COUNT(*) AS c FROM registrations WHERE status='registered' AND flexa_id IS NOT NULL AND flexa_id != '';"
        ).fetchone()["c"]
        by_game = conn.execute(
            """
            SELECT game, COUNT(*) AS c
            FROM registrations
            WHERE status='registered'
            GROUP BY game
            ORDER BY c DESC, game ASC;
            """
        ).fetchall()
        by_platform = conn.execute(
            """
            SELECT platform, COUNT(*) AS c
            FROM registrations
            WHERE status='registered'
            GROUP BY platform
            ORDER BY c DESC, platform ASC;
            """
        ).fetchall()
    return {
        "total": total,
        "with_flexa_id": with_flexa_id,
        "by_game": [dict(row) for row in by_game],
        "by_platform": [dict(row) for row in by_platform],
    }


def list_players(limit: int = 20, game: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if game:
            rows = conn.execute(
                """
                SELECT r.*, u.username
                FROM registrations r
                LEFT JOIN users u ON u.telegram_id = r.telegram_id
                WHERE r.status='registered' AND r.game=?
                ORDER BY r.created_at DESC
                LIMIT ?;
                """,
                (game, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT r.*, u.username
                FROM registrations r
                LEFT JOIN users u ON u.telegram_id = r.telegram_id
                WHERE r.status='registered'
                ORDER BY r.created_at DESC
                LIMIT ?;
                """,
                (limit,),
            ).fetchall()
    return [dict(row) for row in rows]


def get_active_players(game: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if game:
            rows = conn.execute(
                """
                SELECT r.*, u.username
                FROM registrations r
                LEFT JOIN users u ON u.telegram_id = r.telegram_id
                WHERE r.status='registered' AND LOWER(r.game)=LOWER(?)
                ORDER BY r.created_at ASC;
                """,
                (game,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT r.*, u.username
                FROM registrations r
                LEFT JOIN users u ON u.telegram_id = r.telegram_id
                WHERE r.status='registered'
                ORDER BY r.created_at ASC;
                """
            ).fetchall()
    return [dict(row) for row in rows]


def get_active_telegram_ids() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT telegram_id FROM registrations WHERE status='registered';"
        ).fetchall()
    return [int(row["telegram_id"]) for row in rows]


def export_registrations_csv(output_dir: Path | None = None) -> Path:
    output_dir = output_dir or (BASE_DIR / "exports")
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"flexa_telegram_registrations_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    path = output_dir / filename

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                r.id,
                r.telegram_id,
                u.username,
                u.first_name AS telegram_first_name,
                u.last_name AS telegram_last_name,
                r.flexa_id,
                r.full_name,
                r.phone,
                r.game,
                r.platform,
                r.gamer_tag,
                r.city,
                r.team_name,
                r.status,
                r.created_at,
                r.updated_at
            FROM registrations r
            LEFT JOIN users u ON u.telegram_id = r.telegram_id
            ORDER BY r.created_at ASC;
            """
        ).fetchall()

    headers = [
        "id",
        "telegram_id",
        "username",
        "telegram_first_name",
        "telegram_last_name",
        "flexa_id",
        "full_name",
        "phone",
        "game",
        "platform",
        "gamer_tag",
        "city",
        "team_name",
        "status",
        "created_at",
        "updated_at",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in headers})

    return path
