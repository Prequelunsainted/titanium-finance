"""Ponto de entrada: ``python -m titanus`` abre a interface gráfica.

Subcomandos permitem usar pelo terminal (útil em scripts)::

    python -m titanus adicionar "Supermercado" 150,50 -c Alimentação
    python -m titanus resumo --periodo mes
"""

from __future__ import annotations

import argparse
import sys

from . import __version__
from .core import (
    CATEGORIES,
    DEFAULT_CATEGORY,
    EXPENSE,
    INCOME,
    PERIODS,
    ValidationError,
    describe_period,
    filter_transactions,
    format_brl,
    format_date,
    make_transaction,
    period_range,
    summarize,
)
from .storage import Storage

PERIOD_CHOICES = {"mes": "Mês", "3meses": "3 meses", "ano": "Ano", "tudo": "Tudo"}
assert set(PERIOD_CHOICES.values()) == set(PERIODS)


def _plain(text: str) -> str:
    # Terminais antigos do Windows não têm o sinal de menos tipográfico.
    return text.replace("−", "-")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="titanus", description="Titanus Finance Control — finanças pessoais.")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--db", metavar="ARQUIVO", help="banco de dados a usar (padrão: pasta de dados do usuário)")
    parser.add_argument("--demo", action="store_true", help="abre o app com dados de exemplo, sem tocar nos seus")
    sub = parser.add_subparsers(dest="command", metavar="comando")

    add = sub.add_parser("adicionar", help="registra uma movimentação")
    add.add_argument("descricao")
    add.add_argument("valor", help="ex.: 150,50")
    kind = add.add_mutually_exclusive_group()
    kind.add_argument("-r", "--receita", action="store_true", help="é uma receita (padrão: despesa)")
    kind.add_argument("-d", "--despesa", action="store_true", help="é uma despesa")
    add.add_argument("-c", "--categoria", help=f"ex.: {', '.join(CATEGORIES[:4])}…")
    add.add_argument("--data", default="", help="DD/MM/AAAA, 'hoje' ou 'ontem' (padrão: hoje)")

    for name, help_text in (("listar", "lista movimentações"), ("resumo", "mostra totais e gastos por categoria"),
                            ("exportar", "exporta um CSV")):
        cmd = sub.add_parser(name, help=help_text)
        cmd.add_argument("-p", "--periodo", choices=PERIOD_CHOICES, default="mes")
        if name == "listar":
            cmd.add_argument("-n", "--limite", type=int, default=20, help="quantas linhas mostrar")
        if name == "exportar":
            cmd.add_argument("arquivo")

    imp = sub.add_parser("importar", help="importa o financeiro.db da versão 1.x")
    imp.add_argument("arquivo")
    return parser


def run_command(args: argparse.Namespace, storage: Storage) -> int:
    if args.command == "adicionar":
        kind = INCOME if args.receita else EXPENSE
        try:
            t = make_transaction(args.descricao, args.valor, kind, args.categoria or DEFAULT_CATEGORY[kind], args.data)
        except ValidationError as error:
            print(f"erro: {error}", file=sys.stderr)
            return 2
        t = storage.add(t)
        print(_plain(f"#{t.id} {format_date(t.date)}  {t.description}  {t.category}  {format_brl(t.signed, signed=True)}"))
        return 0

    if args.command == "importar":
        count = storage.import_legacy(args.arquivo)
        print(f"{count} movimentações importadas.")
        return 0

    period = period_range(PERIOD_CHOICES[args.periodo])
    rows = filter_transactions(storage.all(), period)

    if args.command == "listar":
        for t in rows[: args.limite]:
            print(_plain(f"{format_date(t.date)}  {t.description[:30]:<30}  {t.category[:14]:<14}  "
                         f"{format_brl(t.signed, signed=True):>16}"))
        if len(rows) > args.limite:
            print(f"… e mais {len(rows) - args.limite}")
        return 0

    if args.command == "resumo":
        s = summarize(rows)
        print(describe_period(period))
        print(_plain(f"  Receitas  {format_brl(s.income):>16}"))
        print(_plain(f"  Despesas  {format_brl(s.expense):>16}"))
        print(_plain(f"  Saldo     {format_brl(s.balance):>16}"))
        if s.savings_rate is not None:
            print(f"  Economia  {s.savings_rate:>15.0%}")
        for name, value in s.by_category:
            print(_plain(f"    {name:<14} {format_brl(value):>14}  {value / s.expense:>4.0%}"))
        return 0

    if args.command == "exportar":
        count = storage.export_csv(args.arquivo, rows)
        print(f"{count} movimentações exportadas para {args.arquivo}")
        return 0
    return 1


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    args = build_parser().parse_args(sys.argv[1:] if argv is None else argv)

    if args.demo:
        from .demo import DEMO_BUDGETS, demo_transactions

        storage = Storage(":memory:")
        storage.add_many(demo_transactions())
        for category, limit in DEMO_BUDGETS.items():
            storage.set_budget(category, limit)
    else:
        storage = Storage(args.db)

    if args.command:
        return run_command(args, storage)

    from .app import run_app

    run_app(storage, demo=args.demo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
