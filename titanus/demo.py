"""Dados de exemplo para conhecer o app sem mexer nas suas finanças (``--demo``)."""

from __future__ import annotations

import random
from datetime import date, timedelta

from .core import EXPENSE, INCOME, Transaction, add_months, month_start

# (descrição, categoria, valor mínimo, valor máximo, dias do mês)
RECURRING = (
    ("Aluguel", "Moradia", 1450, 1450, (6,)),
    ("Conta de luz", "Moradia", 140, 230, (12,)),
    ("Internet", "Tecnologia", 99.9, 99.9, (10,)),
    ("Supermercado", "Alimentação", 180, 340, (3, 14, 24)),
    ("Padaria", "Alimentação", 18, 45, (2, 9, 17, 27)),
    ("Uber", "Transporte", 18, 46, (4, 11, 15, 22)),
    ("Combustível", "Transporte", 150, 220, (8, 23)),
    ("Farmácia", "Saúde", 35, 120, (19,)),
    ("Cinema", "Lazer", 40, 80, (13,)),
    ("Restaurante", "Lazer", 60, 150, (20, 28)),
    ("Curso online", "Educação", 89.9, 89.9, (15,)),
    ("Fatura do cartão", "Cartão", 250, 520, (25,)),
)


def demo_transactions(today: date | None = None, months: int = 12, seed: int = 7) -> list[Transaction]:
    today = today or date.today()
    rng = random.Random(seed)
    items: list[Transaction] = []
    for back in range(months - 1, -1, -1):
        first = add_months(month_start(today), -back)
        salary = 5200 + (months - 1 - back) * 120
        candidates = [("Salário", "Trabalho", salary, salary, (5,), INCOME)]
        if back % 3 == 0:
            candidates.append(("Projeto freelance", "Trabalho", 450, 900, (18,), INCOME))
        candidates += [(*r, EXPENSE) for r in RECURRING]
        for desc, cat, low, high, days, kind in candidates:
            for d in days:
                day = first + timedelta(days=d - 1)
                if day > today or day.month != first.month:
                    continue
                amount = round(rng.uniform(low, high), 2) if low != high else low
                items.append(Transaction(desc, amount, kind, cat, day))
    return items


DEMO_BUDGETS = {"Moradia": 1700, "Alimentação": 1000, "Transporte": 400, "Lazer": 300, "Saúde": 200}
