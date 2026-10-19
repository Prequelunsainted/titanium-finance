"""Persistência em SQLite: movimentações, orçamentos, importação e CSV."""

from __future__ import annotations

import csv
import os
import sqlite3
import sys
from contextlib import closing
from datetime import date, datetime
from pathlib import Path

from .core import EXPENSE, INCOME, Transaction, format_date

SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT    NOT NULL,
    amount      REAL    NOT NULL CHECK (amount > 0),
    kind        TEXT    NOT NULL CHECK (kind IN ('Receita', 'Despesa')),
    category    TEXT    NOT NULL,
    date        TEXT    NOT NULL,  -- ISO 8601 (AAAA-MM-DD), ordena corretamente
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);

CREATE TABLE IF NOT EXISTS budgets (
    category      TEXT PRIMARY KEY,
    monthly_limit REAL NOT NULL CHECK (monthly_limit > 0)
);
"""

LEGACY_FILENAME = "financeiro.db"


def data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "Titanus"


def default_db_path() -> Path:
    override = os.environ.get("TITANUS_DB")
    return Path(override) if override else data_dir() / "titanus.db"


class Storage:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else default_db_path()
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._memory = sqlite3.connect(":memory:") if str(self.path) == ":memory:" else None
        db = self._connect()
        try:
            db.executescript(SCHEMA)
        finally:
            if self._memory is None:
                db.close()

    def _connect(self) -> sqlite3.Connection:
        if self._memory is not None:
            return self._memory
        db = sqlite3.connect(self.path)
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def _run(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        db = self._connect()
        try:
            with db:
                return db.execute(sql, params)
        finally:
            if self._memory is None:
                db.close()

    def _query(self, sql: str, params: tuple = ()) -> list[tuple]:
        db = self._connect()
        try:
            return db.execute(sql, params).fetchall()
        finally:
            if self._memory is None:
                db.close()

    # ------------------------------------------------------------ movimentações

    def add(self, t: Transaction) -> Transaction:
        cur = self._run(
            "INSERT INTO transactions (description, amount, kind, category, date) VALUES (?, ?, ?, ?, ?)",
            (t.description, t.amount, t.kind, t.category, t.date.isoformat()),
        )
        return t.with_id(cur.lastrowid)

    def add_many(self, items: list[Transaction]) -> int:
        db = self._connect()
        try:
            with db:
                db.executemany(
                    "INSERT INTO transactions (description, amount, kind, category, date) VALUES (?, ?, ?, ?, ?)",
                    [(t.description, t.amount, t.kind, t.category, t.date.isoformat()) for t in items],
                )
        finally:
            if self._memory is None:
                db.close()
        return len(items)

    def update(self, t: Transaction) -> None:
        if t.id is None:
            raise ValueError("movimentação sem id")
        self._run(
            "UPDATE transactions SET description = ?, amount = ?, kind = ?, category = ?, date = ? WHERE id = ?",
            (t.description, t.amount, t.kind, t.category, t.date.isoformat(), t.id),
        )

    def delete(self, transaction_id: int) -> None:
        self._run("DELETE FROM transactions WHERE id = ?", (transaction_id,))

    def get(self, transaction_id: int) -> Transaction | None:
        rows = self._query(
            "SELECT id, description, amount, kind, category, date FROM transactions WHERE id = ?",
            (transaction_id,),
        )
        return _row_to_transaction(rows[0]) if rows else None

    def all(self) -> list[Transaction]:
        """Todas as movimentações, das mais recentes para as mais antigas."""
        rows = self._query(
            "SELECT id, description, amount, kind, category, date FROM transactions ORDER BY date DESC, id DESC"
        )
        return [_row_to_transaction(r) for r in rows]

    def count(self) -> int:
        return self._query("SELECT COUNT(*) FROM transactions")[0][0]

    def categories(self) -> list[str]:
        return [r[0] for r in self._query("SELECT DISTINCT category FROM transactions ORDER BY category")]

    # ---------------------------------------------------------------- orçamentos

    def budgets(self) -> dict[str, float]:
        return dict(self._query("SELECT category, monthly_limit FROM budgets ORDER BY category"))

    def set_budget(self, category: str, monthly_limit: float | None) -> None:
        """Define o limite mensal da categoria; ``None`` remove o orçamento."""
        if monthly_limit is None or monthly_limit <= 0:
            self._run("DELETE FROM budgets WHERE category = ?", (category,))
        else:
            self._run(
                "INSERT INTO budgets (category, monthly_limit) VALUES (?, ?) "
                "ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit",
                (category, round(monthly_limit, 2)),
            )

    # -------------------------------------------------------- importar/exportar

    def import_legacy(self, legacy_path: str | Path) -> int:
        """Copia as movimentações do ``financeiro.db`` da versão 1.x.

        A versão antiga guardava datas como texto ``DD/MM/AAAA``; linhas com
        dados que não fazem sentido são ignoradas em vez de travar a importação.
        """
        with closing(sqlite3.connect(legacy_path)) as old:
            try:
                rows = old.execute("SELECT descricao, valor, tipo, categoria, data FROM movimentacoes").fetchall()
            except sqlite3.Error:
                return 0
        items = []
        for desc, value, kind, category, raw_date in rows:
            kind = INCOME if str(kind).strip().lower() == "receita" else EXPENSE
            try:
                day = datetime.strptime(str(raw_date).strip(), "%d/%m/%Y").date()
                amount = round(float(value), 2)
            except (TypeError, ValueError):
                continue
            if amount <= 0 or not str(desc or "").strip():
                continue
            items.append(Transaction(str(desc).strip(), amount, kind, str(category or "Outros").strip() or "Outros", day))
        return self.add_many(items)

    def export_csv(self, path: str | Path, transactions: list[Transaction] | None = None) -> int:
        """Grava um CSV que abre direto no Excel em português (``;`` e vírgula decimal)."""
        rows = self.all() if transactions is None else transactions
        with open(path, "w", newline="", encoding="utf-8-sig") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["Data", "Descrição", "Categoria", "Tipo", "Valor"])
            for t in rows:
                writer.writerow(
                    [format_date(t.date), t.description, t.category, t.kind, f"{t.signed:.2f}".replace(".", ",")]
                )
        return len(rows)


def find_legacy_database(*folders: Path) -> Path | None:
    for folder in folders:
        candidate = Path(folder) / LEGACY_FILENAME
        if candidate.is_file():
            return candidate
    return None


def _row_to_transaction(row: tuple) -> Transaction:
    tid, desc, amount, kind, category, iso = row
    return Transaction(desc, amount, kind, category, date.fromisoformat(iso), tid)
