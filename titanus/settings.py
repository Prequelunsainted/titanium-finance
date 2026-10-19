"""Preferências da interface salvas entre execuções (tema, período, último tipo)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path

from .core import DEFAULT_CATEGORY, EXPENSE, KINDS, PERIODS
from .storage import data_dir


def settings_path() -> Path:
    return data_dir() / "settings.json"


@dataclass
class Settings:
    appearance: str = "Escuro"
    period: str = "Mês"
    page: str = "Painel"
    last_kind: str = EXPENSE
    last_category: str = DEFAULT_CATEGORY[EXPENSE]

    @classmethod
    def load(cls, path: Path | None = None) -> "Settings":
        path = path or settings_path()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()
        if not isinstance(data, dict):
            return cls()

        defaults = cls()
        values = {}
        for f in fields(cls):
            value = data.get(f.name, getattr(defaults, f.name))
            # Ignora valores com tipo errado (arquivo editado à mão, versão antiga...).
            if type(value) is type(getattr(defaults, f.name)):
                values[f.name] = value
        settings = cls(**values)
        if settings.period not in PERIODS:
            settings.period = defaults.period
        if settings.last_kind not in KINDS:
            settings.last_kind = defaults.last_kind
        return settings

    def save(self, path: Path | None = None) -> None:
        path = path or settings_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass  # Preferências são conveniência; não vale derrubar o app por isso.
