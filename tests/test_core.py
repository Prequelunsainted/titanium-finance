import unittest
from datetime import date

from titanus.core import (
    EXPENSE,
    INCOME,
    BudgetStatus,
    Transaction,
    ValidationError,
    add_months,
    budget_statuses,
    comparison_label,
    describe_period,
    filter_transactions,
    format_brl,
    format_compact,
    make_transaction,
    monthly_series,
    parse_amount,
    parse_date,
    percent_change,
    period_range,
    previous_period,
    summarize,
    top_categories,
)

TODAY = date(2026, 10, 16)


def tx(desc, amount, kind=EXPENSE, category="Alimentação", day=TODAY):
    return Transaction(desc, amount, kind, category, day)


class AmountTests(unittest.TestCase):
    def test_brazilian_and_international_formats(self):
        cases = {
            "150": 150, "150,5": 150.5, "150,50": 150.5, "150.50": 150.5, "1.500": 1500,
            "1.500,50": 1500.5, "1,500.50": 1500.5, "R$ 2.000,00": 2000, " 12 ": 12,
            "1.234.567": 1234567, "0,99": 0.99,
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertAlmostEqual(parse_amount(text), expected)

    def test_invalid_amounts(self):
        for text in ("", "abc", "0", "0,00", "-5", "1,2,3", "12a"):
            with self.subTest(text=text), self.assertRaises(ValidationError):
                parse_amount(text)

    def test_format_brl(self):
        self.assertEqual(format_brl(1350.5), "R$ 1.350,50")
        self.assertEqual(format_brl(0), "R$ 0,00")
        self.assertEqual(format_brl(-38.9), "−R$ 38,90")
        self.assertEqual(format_brl(6200, signed=True), "+ R$ 6.200,00")
        self.assertEqual(format_brl(-1450, signed=True), "− R$ 1.450,00")
        self.assertEqual(format_brl(1450.4, cents=False), "R$ 1.450")

    def test_format_compact(self):
        self.assertEqual(format_compact(6900), "R$ 6,9 mil")
        self.assertEqual(format_compact(2000), "R$ 2 mil")
        self.assertEqual(format_compact(950), "R$ 950")
        self.assertEqual(format_compact(1_500_000), "R$ 1,5 mi")
        self.assertEqual(format_compact(7500, currency=False), "7,5 mil")


class DateTests(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(parse_date("14/10/2026", TODAY), date(2026, 10, 14))
        self.assertEqual(parse_date("14/10/26", TODAY), date(2026, 10, 14))
        self.assertEqual(parse_date("1/2", TODAY), date(2026, 2, 1))
        self.assertEqual(parse_date("2026-03-05", TODAY), date(2026, 3, 5))
        self.assertEqual(parse_date("", TODAY), TODAY)
        self.assertEqual(parse_date("Hoje", TODAY), TODAY)
        self.assertEqual(parse_date("ontem", TODAY), date(2026, 10, 15))

    def test_invalid_dates(self):
        for text in ("31/02/2026", "amanhã talvez", "2026/13/01", "32/01"):
            with self.subTest(text=text), self.assertRaises(ValidationError):
                parse_date(text, TODAY)

    def test_add_months_crosses_years(self):
        self.assertEqual(add_months(date(2026, 1, 20), -1), date(2025, 12, 1))
        self.assertEqual(add_months(date(2026, 11, 3), 2), date(2027, 1, 1))


class TransactionTests(unittest.TestCase):
    def test_make_transaction_cleans_input(self):
        t = make_transaction("  Mercado   do  bairro ", "1.500,5", EXPENSE, " ", "14/10", TODAY)
        self.assertEqual(t.description, "Mercado do bairro")
        self.assertEqual(t.amount, 1500.5)
        self.assertEqual(t.category, "Outros")
        self.assertEqual(t.date, date(2026, 10, 14))
        self.assertEqual(t.signed, -1500.5)

    def test_make_transaction_validation(self):
        with self.assertRaises(ValidationError):
            make_transaction("", "10", EXPENSE, "Lazer", "", TODAY)
        with self.assertRaises(ValidationError):
            make_transaction("Algo", "10", "Transferência", "Lazer", "", TODAY)
        with self.assertRaises(ValidationError):
            make_transaction("Algo", "x", EXPENSE, "Lazer", "", TODAY)


class PeriodTests(unittest.TestCase):
    def test_ranges(self):
        month = period_range("Mês", TODAY)
        self.assertEqual((month.start, month.end), (date(2026, 10, 1), date(2026, 11, 1)))
        quarter = period_range("3 meses", TODAY)
        self.assertEqual((quarter.start, quarter.end), (date(2026, 8, 1), date(2026, 11, 1)))
        year = period_range("Ano", TODAY)
        self.assertEqual((year.start, year.end), (date(2026, 1, 1), date(2027, 1, 1)))
        self.assertTrue(period_range("Tudo", TODAY).contains(date(1999, 1, 1)))

    def test_previous_period(self):
        jan = period_range("Mês", date(2026, 1, 10))
        prev = previous_period(jan)
        self.assertEqual((prev.start, prev.end), (date(2025, 12, 1), date(2026, 1, 1)))
        # Período em andamento: compara só o mesmo trecho do anterior.
        prev_m = previous_period(period_range("Mês", TODAY), TODAY)
        self.assertEqual((prev_m.start, prev_m.end), (date(2026, 9, 1), date(2026, 9, 17)))
        prev_q = previous_period(period_range("3 meses", TODAY), TODAY)
        self.assertEqual((prev_q.start, prev_q.end), (date(2026, 5, 1), date(2026, 7, 17)))
        prev_y = previous_period(period_range("Ano", TODAY), TODAY)
        self.assertEqual((prev_y.start, prev_y.end), (date(2025, 1, 1), date(2025, 10, 17)))
        # Período já encerrado: compara com o anterior inteiro.
        prev_full = previous_period(period_range("3 meses", TODAY), date(2027, 1, 1))
        self.assertEqual((prev_full.start, prev_full.end), (date(2026, 5, 1), date(2026, 8, 1)))
        self.assertIsNone(previous_period(period_range("Tudo", TODAY), TODAY))

    def test_labels(self):
        self.assertEqual(describe_period(period_range("Mês", TODAY)), "Outubro de 2026")
        self.assertEqual(describe_period(period_range("3 meses", TODAY)), "Agosto a outubro de 2026")
        self.assertEqual(describe_period(period_range("3 meses", date(2026, 1, 5))),
                         "Novembro de 2025 a janeiro de 2026")
        self.assertEqual(comparison_label(period_range("Mês", TODAY), TODAY), "vs. setembro até dia 16")
        self.assertEqual(comparison_label(period_range("Mês", TODAY), date(2026, 12, 1)), "vs. setembro")
        self.assertEqual(comparison_label(period_range("Ano", TODAY), TODAY), "vs. 2025 até 16/10")


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.items = [
            tx("Salário", 5000, INCOME, "Trabalho", date(2026, 10, 5)),
            tx("Aluguel", 1500, category="Moradia", day=date(2026, 10, 6)),
            tx("Mercado", 400.55, day=date(2026, 10, 9)),
            tx("Mercado", 99.45, day=date(2026, 9, 20)),
            tx("Uber", 50, category="Transporte", day=date(2026, 9, 2)),
        ]

    def test_summary(self):
        s = summarize(filter_transactions(self.items, period_range("Mês", TODAY)))
        self.assertEqual((s.income, s.expense, s.balance, s.count), (5000, 1900.55, 3099.45, 3))
        self.assertEqual(s.by_category[0], ("Moradia", 1500))
        self.assertAlmostEqual(s.savings_rate, 3099.45 / 5000)
        self.assertIsNone(summarize([tx("x", 10)]).savings_rate)

    def test_filters(self):
        self.assertEqual(len(filter_transactions(self.items, kind=INCOME)), 1)
        self.assertEqual(len(filter_transactions(self.items, category="Alimentação")), 2)
        self.assertEqual(len(filter_transactions(self.items, text="merc")), 2)
        self.assertEqual(len(filter_transactions(self.items, text="moradia")), 1)

    def test_monthly_series(self):
        series = monthly_series(self.items, TODAY, months=3)
        self.assertEqual([m.label for m in series], ["Ago", "Set", "Out"])
        self.assertEqual((series[1].income, series[1].expense), (0, 149.45))
        self.assertEqual((series[2].income, series[2].expense), (5000, 1900.55))

    def test_top_categories_groups_the_rest(self):
        data = tuple((f"C{i}", 100 - i) for i in range(8))
        top = top_categories(data, 5)
        self.assertEqual(len(top), 6)
        self.assertEqual(top[-1], ("Outras", 95 + 94 + 93))
        self.assertEqual(top_categories(data[:6], 5), list(data[:6]))

    def test_percent_change(self):
        self.assertAlmostEqual(percent_change(150, 100), 0.5)
        self.assertAlmostEqual(percent_change(50, 100), -0.5)
        self.assertIsNone(percent_change(10, 0))

    def test_budgets(self):
        month = filter_transactions(self.items, period_range("Mês", TODAY))
        statuses = budget_statuses({"Moradia": 1400, "Alimentação": 440, "Lazer": 300}, month)
        self.assertEqual([s.category for s in statuses], ["Moradia", "Alimentação", "Lazer"])
        self.assertEqual([s.level for s in statuses], ["estourado", "alerta", "ok"])
        self.assertEqual(statuses[0].remaining, -100)
        self.assertEqual(BudgetStatus("x", 0, 100).ratio, 0)


if __name__ == "__main__":
    unittest.main()
