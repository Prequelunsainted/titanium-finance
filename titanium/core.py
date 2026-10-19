"""Regras financeiras do Titanium — sem dependência de interface ou banco.

Conversão de valores e datas, períodos, totais, séries mensais e orçamentos.
Tudo aqui é usado pela GUI, pela linha de comando e pelos testes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import date, timedelta

INCOME = "Receita"
EXPENSE = "Despesa"
KINDS = (EXPENSE, INCOME)

CATEGORIES = (
    "Alimentação",
    "Moradia",
    "Transporte",
    "Saúde",
    "Educação",
    "Lazer",
    "Tecnologia",
    "Cartão",
    "Trabalho",
    "Investimentos",
    "Outros",
)
DEFAULT_CATEGORY = {EXPENSE: "Alimentação", INCOME: "Trabalho"}

PERIODS = ("Mês", "3 meses", "Ano", "Tudo")

MONTHS = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)
MONTHS_SHORT = ("Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez")

MAX_AMOUNT = 1_000_000_000


class ValidationError(ValueError):
    """Entrada do usuário inválida, com mensagem pronta para exibir."""


@dataclass(frozen=True)
class Transaction:
    description: str
    amount: float
    kind: str
    category: str
    date: date
    id: int | None = None

    @property
    def is_income(self) -> bool:
        return self.kind == INCOME

    @property
    def signed(self) -> float:
        return self.amount if self.is_income else -self.amount

    def with_id(self, new_id: int) -> "Transaction":
        return replace(self, id=new_id)


def make_transaction(
    description: str,
    amount: str | float,
    kind: str,
    category: str,
    when: str | date | None,
    today: date | None = None,
    id: int | None = None,
) -> Transaction:
    """Valida os campos digitados e devolve uma ``Transaction`` pronta para salvar."""
    description = " ".join(description.split())
    if not description:
        raise ValidationError("Informe uma descrição.")
    if len(description) > 120:
        raise ValidationError("A descrição pode ter no máximo 120 caracteres.")
    if kind not in KINDS:
        raise ValidationError("O tipo deve ser Receita ou Despesa.")
    value = amount if isinstance(amount, (int, float)) else parse_amount(amount)
    if value <= 0:
        raise ValidationError("O valor deve ser maior que zero.")
    category = " ".join((category or "").split()) or "Outros"
    day = when if isinstance(when, date) else parse_date(when or "", today)
    return Transaction(description, round(float(value), 2), kind, category, day, id)


# ------------------------------------------------------------------ valores


def parse_amount(text: str) -> float:
    """Converte o que o usuário digitou em reais para ``float``.

    Aceita ``150``, ``150,5``, ``150.50``, ``1.500``, ``1.500,50``, ``1,500.50``
    e ``R$ 1.500,50``. O ponto só é tratado como separador de milhar quando
    vem seguido de exatamente três dígitos (``1.500``) ou quando há vírgula.
    """
    raw = (text or "").strip().replace("R$", "").replace(" ", "").replace(" ", "")
    if not raw:
        raise ValidationError("Informe um valor.")
    if raw.startswith("-"):
        raise ValidationError("O valor deve ser maior que zero.")
    if not re.fullmatch(r"[\d.,]+", raw):
        raise ValidationError("Valor inválido. Use números, como 150,50.")

    if "," in raw and "." in raw:
        # O separador que aparece por último é o decimal.
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        if raw.count(",") > 1:
            raise ValidationError("Valor inválido. Use números, como 150,50.")
        raw = raw.replace(",", ".")
    elif raw.count(".") > 1 or re.fullmatch(r"\d{1,3}\.\d{3}", raw):
        raw = raw.replace(".", "")

    try:
        value = float(raw)
    except ValueError:
        raise ValidationError("Valor inválido. Use números, como 150,50.") from None
    if value <= 0:
        raise ValidationError("O valor deve ser maior que zero.")
    if value >= MAX_AMOUNT:
        raise ValidationError("Valor alto demais.")
    return round(value, 2)


def format_brl(value: float, signed: bool = False, cents: bool = True) -> str:
    """``1350.5`` → ``R$ 1.350,50``; com ``signed`` → ``+ R$ 1.350,50``."""
    value = round(value or 0.0, 2)
    number = f"{abs(value):,.{2 if cents else 0}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if signed:
        return f"{'+' if value >= 0 else '−'} R$ {number}"
    return f"{'−' if value < 0 else ''}R$ {number}"


def format_compact(value: float, currency: bool = True) -> str:
    """Valor curto para eixos e rótulos: ``R$ 6,9 mil`` (ou ``6,9 mil``)."""
    value = abs(value)
    if value >= 1_000_000:
        text = f"{value / 1_000_000:.1f} mi".replace(".", ",").replace(",0 mi", " mi")
    elif value >= 1_000:
        text = f"{value / 1_000:.1f} mil".replace(".", ",").replace(",0 mil", " mil")
    else:
        text = f"{value:.0f}"
    return f"R$ {text}" if currency else text


# ------------------------------------------------------------------- datas


def parse_date(text: str, today: date | None = None) -> date:
    """Aceita ``14/10/2026``, ``14/10/26``, ``14/10``, ``2026-10-14``, ``hoje`` e ``ontem``.

    Vazio significa hoje.
    """
    today = today or date.today()
    raw = (text or "").strip().lower()
    if raw in ("", "hoje"):
        return today
    if raw == "ontem":
        return today - timedelta(days=1)

    try:
        if re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", raw):
            y, m, d = map(int, raw.split("-"))
            return date(y, m, d)
        match = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?", raw)
        if match:
            d, m = int(match[1]), int(match[2])
            y = int(match[3]) if match[3] else today.year
            if match[3] and len(match[3]) == 2:
                y += 2000
            return date(y, m, d)
    except ValueError:
        pass
    raise ValidationError("Data inválida. Use DD/MM/AAAA (ex.: 14/10/2026).")


def format_date(day: date, short: bool = False) -> str:
    return day.strftime("%d/%m") if short else day.strftime("%d/%m/%Y")


def month_start(day: date) -> date:
    return day.replace(day=1)


def add_months(day: date, months: int) -> date:
    """Primeiro dia do mês ``months`` meses depois (ou antes) de ``day``."""
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def month_name(day: date) -> str:
    return MONTHS[day.month - 1]


# ----------------------------------------------------------------- períodos


@dataclass(frozen=True)
class Period:
    name: str
    start: date | None  # inclusivo; None = desde sempre
    end: date | None  # exclusivo; None = até sempre

    def contains(self, day: date) -> bool:
        return (self.start is None or day >= self.start) and (self.end is None or day < self.end)

    @property
    def is_all(self) -> bool:
        return self.start is None


def period_range(name: str, today: date | None = None) -> Period:
    today = today or date.today()
    first = month_start(today)
    if name == "Mês":
        return Period(name, first, add_months(first, 1))
    if name == "3 meses":
        return Period(name, add_months(first, -2), add_months(first, 1))
    if name == "Ano":
        return Period(name, date(today.year, 1, 1), date(today.year + 1, 1, 1))
    if name == "Tudo":
        return Period(name, None, None)
    raise ValueError(f"período desconhecido: {name}")


def previous_period(period: Period, today: date | None = None) -> Period | None:
    """O período imediatamente anterior, para comparar.

    Se o período atual ainda está em andamento, compara só o mesmo trecho do
    anterior (1º a 19 de outubro contra 1º a 19 de setembro) — senão o mês
    corrente pareceria sempre gastar menos.
    """
    if period.is_all:
        return None
    if period.name == "Ano":
        start = date(period.start.year - 1, 1, 1)
    else:
        start = add_months(period.start, -(3 if period.name == "3 meses" else 1))
    end = period.start
    today = today or date.today()
    if period.contains(today):
        elapsed = today - period.start + timedelta(days=1)
        end = min(end, start + elapsed)
    return Period(period.name, start, end)


def describe_period(period: Period) -> str:
    """Texto do subtítulo: ``Outubro de 2026``, ``Agosto a outubro de 2026``…"""
    if period.is_all:
        return "Todo o histórico"
    if period.name == "Ano":
        return str(period.start.year)
    last = add_months(period.end, -1)
    if period.name == "Mês":
        return f"{month_name(last).capitalize()} de {last.year}"
    first = period.start
    if first.year == last.year:
        return f"{month_name(first).capitalize()} a {month_name(last)} de {last.year}"
    return f"{month_name(first).capitalize()} de {first.year} a {month_name(last)} de {last.year}"


def comparison_label(period: Period, today: date | None = None) -> str:
    today = today or date.today()
    partial = period.contains(today)
    if period.name == "Mês":
        label = "vs. " + month_name(add_months(period.start, -1))
        return f"{label} até dia {today.day}" if partial else label
    if period.name == "3 meses":
        return "vs. mesmo trecho anterior" if partial else "vs. 3 meses anteriores"
    if period.name == "Ano":
        label = f"vs. {period.start.year - 1}"
        return f"{label} até {format_date(today, short=True)}" if partial else label
    return ""


# ------------------------------------------------------------------ análises


@dataclass(frozen=True)
class Summary:
    income: float
    expense: float
    count: int
    by_category: tuple[tuple[str, float], ...]  # despesas, da maior para a menor

    @property
    def balance(self) -> float:
        return round(self.income - self.expense, 2)

    @property
    def savings_rate(self) -> float | None:
        """Fração da receita que sobrou (pode ser negativa); ``None`` sem receita."""
        return self.balance / self.income if self.income > 0 else None


def filter_transactions(
    transactions: list[Transaction],
    period: Period | None = None,
    kind: str | None = None,
    category: str | None = None,
    text: str = "",
) -> list[Transaction]:
    needle = text.strip().casefold()
    return [
        t
        for t in transactions
        if (period is None or period.contains(t.date))
        and (kind is None or t.kind == kind)
        and (category is None or t.category == category)
        and (not needle or needle in t.description.casefold() or needle in t.category.casefold())
    ]


def summarize(transactions: list[Transaction]) -> Summary:
    income = expense = 0.0
    categories: dict[str, float] = {}
    for t in transactions:
        if t.is_income:
            income += t.amount
        else:
            expense += t.amount
            categories[t.category] = categories.get(t.category, 0.0) + t.amount
    ranked = tuple(sorted(((c, round(v, 2)) for c, v in categories.items()), key=lambda x: (-x[1], x[0])))
    return Summary(round(income, 2), round(expense, 2), len(transactions), ranked)


def top_categories(by_category: tuple[tuple[str, float], ...], limit: int = 5) -> list[tuple[str, float]]:
    """As ``limit`` maiores categorias; o resto vira "Outras"."""
    items = list(by_category)
    if len(items) <= limit + 1:
        return items
    rest = round(sum(v for _, v in items[limit:]), 2)
    return items[:limit] + [("Outras", rest)]


def percent_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return (current - previous) / abs(previous)


@dataclass(frozen=True)
class MonthTotals:
    month: date
    income: float
    expense: float

    @property
    def label(self) -> str:
        return MONTHS_SHORT[self.month.month - 1]


def monthly_series(transactions: list[Transaction], last_month: date, months: int = 6) -> list[MonthTotals]:
    """Receitas e despesas dos ``months`` meses que terminam em ``last_month``."""
    first = add_months(month_start(last_month), -(months - 1))
    buckets = {add_months(first, i): [0.0, 0.0] for i in range(months)}
    for t in transactions:
        key = month_start(t.date)
        if key in buckets:
            buckets[key][0 if t.is_income else 1] += t.amount
    return [MonthTotals(m, round(i, 2), round(e, 2)) for m, (i, e) in buckets.items()]


# ---------------------------------------------------------------- orçamentos

BUDGET_WARNING = 0.9  # a partir de 90% do limite o orçamento fica em alerta


@dataclass(frozen=True)
class BudgetStatus:
    category: str
    spent: float
    limit: float

    @property
    def ratio(self) -> float:
        return self.spent / self.limit if self.limit > 0 else 0.0

    @property
    def level(self) -> str:
        """``ok``, ``alerta`` (≥ 90%) ou ``estourado`` (> 100%)."""
        if self.ratio > 1:
            return "estourado"
        if self.ratio >= BUDGET_WARNING:
            return "alerta"
        return "ok"

    @property
    def remaining(self) -> float:
        return round(self.limit - self.spent, 2)


def budget_statuses(
    budgets: dict[str, float], month_transactions: list[Transaction]
) -> list[BudgetStatus]:
    """Situação de cada orçamento, do mais apertado para o mais folgado."""
    spent = dict(summarize(month_transactions).by_category)
    statuses = [BudgetStatus(c, spent.get(c, 0.0), lim) for c, lim in budgets.items() if lim > 0]
    return sorted(statuses, key=lambda s: (-s.ratio, s.category))
