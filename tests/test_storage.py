import contextlib
import csv
import io
import json
import sqlite3
import tempfile
import unittest
from datetime import date
from pathlib import Path

from titanium.__main__ import main
from titanium.core import EXPENSE, INCOME, Transaction
from titanium.demo import demo_transactions
from titanium.settings import Settings
from titanium.storage import Storage, find_legacy_database


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.storage = Storage(self.folder / "titanium.db")

    def test_crud_and_ordering(self):
        a = self.storage.add(Transaction("Mercado", 120.5, EXPENSE, "Alimentação", date(2026, 10, 3)))
        b = self.storage.add(Transaction("Salário", 5000, INCOME, "Trabalho", date(2026, 10, 5)))
        self.assertEqual([t.description for t in self.storage.all()], ["Salário", "Mercado"])
        self.storage.update(Transaction("Mercado X", 130, EXPENSE, "Alimentação", date(2026, 10, 7), a.id))
        self.assertEqual(self.storage.get(a.id).description, "Mercado X")
        self.assertEqual(self.storage.all()[0].id, a.id)  # agora é a mais recente
        self.storage.delete(b.id)
        self.assertIsNone(self.storage.get(b.id))
        self.assertEqual(self.storage.count(), 1)

    def test_rejects_bad_rows(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.storage.add(Transaction("Erro", -5, EXPENSE, "X", date(2026, 1, 1)))

    def test_budgets(self):
        self.storage.set_budget("Lazer", 300)
        self.storage.set_budget("Lazer", 350.555)
        self.storage.set_budget("Saúde", 200)
        self.assertEqual(self.storage.budgets(), {"Lazer": 350.56, "Saúde": 200})
        self.storage.set_budget("Saúde", None)
        self.assertEqual(self.storage.budgets(), {"Lazer": 350.56})

    def test_import_legacy_database(self):
        legacy = self.folder / "financeiro.db"
        with contextlib.closing(sqlite3.connect(legacy)) as db:
            db.execute("CREATE TABLE movimentacoes (id INTEGER PRIMARY KEY, usuario_id INTEGER, descricao TEXT, "
                       "valor REAL, tipo TEXT, categoria TEXT, data TEXT)")
            db.executemany(
                "INSERT INTO movimentacoes (usuario_id, descricao, valor, tipo, categoria, data) VALUES (1,?,?,?,?,?)",
                [("Salário", 5000, "Receita", "Trabalho", "05/10/2026"),
                 ("Pizza", 60.5, "despesa", "Lazer", "10/10/2026"),
                 ("Quebrada", 10, "Despesa", "Lazer", "data ruim"),
                 ("", 10, "Despesa", "Lazer", "10/10/2026")],
            )
            db.commit()
        self.assertEqual(find_legacy_database(Path("nao-existe"), self.folder), legacy)
        self.assertEqual(self.storage.import_legacy(legacy), 2)
        pizza = self.storage.all()[0]
        self.assertEqual((pizza.description, pizza.kind, pizza.date), ("Pizza", EXPENSE, date(2026, 10, 10)))

    def test_export_csv(self):
        self.storage.add(Transaction("Café", 8.5, EXPENSE, "Alimentação", date(2026, 10, 3)))
        path = self.folder / "out.csv"
        self.assertEqual(self.storage.export_csv(path), 1)
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f, delimiter=";"))
        self.assertEqual(rows[0], ["Data", "Descrição", "Categoria", "Tipo", "Valor"])
        self.assertEqual(rows[1], ["03/10/2026", "Café", "Alimentação", "Despesa", "-8,50"])

    def test_memory_database_and_demo_data(self):
        memory = Storage(":memory:")
        self.assertEqual(memory.add_many(demo_transactions(date(2026, 10, 16))), len(memory.all()))
        self.assertGreater(memory.count(), 100)
        self.assertTrue(all(t.date <= date(2026, 10, 16) for t in memory.all()))


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = main(["--db", str(self.db), *args])
        return code, out.getvalue()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "cli.db"

    def test_add_list_summary_export(self):
        self.assertEqual(self.run_cli("adicionar", "Salário", "5.000", "-r", "-c", "Trabalho")[0], 0)
        self.assertEqual(self.run_cli("adicionar", "Mercado", "150,50")[0], 0)
        code, out = self.run_cli("listar")
        self.assertEqual(code, 0)
        self.assertIn("Mercado", out)
        self.assertIn("- R$ 150,50", out)
        code, out = self.run_cli("resumo")
        self.assertIn("R$ 4.849,50", out)
        csv_path = Path(self.tmp.name) / "r.csv"
        self.assertEqual(self.run_cli("exportar", str(csv_path), "-p", "tudo")[0], 0)
        self.assertTrue(csv_path.exists())

    def test_invalid_value(self):
        self.assertEqual(self.run_cli("adicionar", "Nada", "abc")[0], 2)


class SettingsTests(unittest.TestCase):
    def test_round_trip_and_bad_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            Settings(appearance="Claro", period="Ano").save(path)
            self.assertEqual(Settings.load(path).period, "Ano")
            path.write_text(json.dumps({"period": "Semana", "appearance": 3, "last_kind": "X"}), encoding="utf-8")
            loaded = Settings.load(path)
            self.assertEqual((loaded.period, loaded.appearance, loaded.last_kind), ("Mês", "Escuro", EXPENSE))
            path.write_text("[]", encoding="utf-8")
            self.assertEqual(Settings.load(path), Settings())


if __name__ == "__main__":
    unittest.main()
