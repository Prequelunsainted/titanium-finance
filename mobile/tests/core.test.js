import {
  EXPENSE, INCOME, ValidationError,
  addMonths, budgetStatuses, comparisonLabel, demoTransactions, describePeriod, exportCsv, filterTransactions,
  formatBrl, formatCompact, formatDate, importCsv, makeTransaction, monthlySeries, parseAmount, parseDate,
  percentChange, periodRange, previousPeriod, sortRecent, summarize, topCategories,
} from "../core.js";
import { assert, close, deepEqual, equal, report, test, throws } from "./harness.js";

const TODAY = "2026-10-16";
const tx = (description, amount, kind = EXPENSE, category = "Alimentação", date = TODAY, id = 1) => ({ id, description, amount, kind, category, date });

test("valores nos formatos brasileiro e internacional", () => {
  const cases = { "150": 150, "150,5": 150.5, "150,50": 150.5, "150.50": 150.5, "1.500": 1500, "1.500,50": 1500.5, "1,500.50": 1500.5, "R$ 2.000,00": 2000, " 12 ": 12, "1.234.567": 1234567, "0,99": 0.99 };
  for (const [text, expected] of Object.entries(cases)) close(parseAmount(text), expected, text);
});

test("valores inválidos são recusados", () => {
  for (const text of ["", "abc", "0", "0,00", "-5", "1,2,3", "12a", ".", "1,234.5.6"]) throws(() => parseAmount(text), ValidationError);
});

test("formatBrl e formatCompact", () => {
  equal(formatBrl(1350.5), "R$ 1.350,50");
  equal(formatBrl(0), "R$ 0,00");
  equal(formatBrl(-38.9), "−R$ 38,90");
  equal(formatBrl(6200, { signed: true }), "+ R$ 6.200,00");
  equal(formatBrl(-1450, { signed: true }), "− R$ 1.450,00");
  equal(formatBrl(1450.4, { cents: false }), "R$ 1.450");
  equal(formatBrl(1234567.89), "R$ 1.234.567,89");
  equal(formatCompact(6900), "R$ 6,9 mil");
  equal(formatCompact(2000), "R$ 2 mil");
  equal(formatCompact(950), "R$ 950");
  equal(formatCompact(1_500_000), "R$ 1,5 mi");
  equal(formatCompact(7500, { currency: false }), "7,5 mil");
});

test("datas em vários formatos", () => {
  equal(parseDate("14/10/2026", TODAY), "2026-10-14");
  equal(parseDate("14/10/26", TODAY), "2026-10-14");
  equal(parseDate("1/2", TODAY), "2026-02-01");
  equal(parseDate("2026-03-05", TODAY), "2026-03-05");
  equal(parseDate("", TODAY), TODAY);
  equal(parseDate("Hoje", TODAY), TODAY);
  equal(parseDate("ontem", TODAY), "2026-10-15");
  equal(parseDate("1/3/2026", "2026-03-01"), "2026-03-01");
  equal(parseDate("ontem", "2026-03-01"), "2026-02-28");
  equal(formatDate("2026-10-04"), "04/10/2026");
  equal(formatDate("2026-10-04", { short: true }), "04/10");
});

test("datas inválidas são recusadas", () => {
  for (const text of ["31/02/2026", "amanhã talvez", "2026/13/01", "32/01", "29/02/2027"]) throws(() => parseDate(text, TODAY), ValidationError);
  equal(parseDate("29/02/2028", TODAY), "2028-02-29");
});

test("addMonths atravessa anos", () => {
  equal(addMonths("2026-01-20", -1), "2025-12-01");
  equal(addMonths("2026-11-03", 2), "2027-01-01");
});

test("makeTransaction limpa e valida a entrada", () => {
  const t = makeTransaction({ description: "  Mercado   do  bairro ", amount: "1.500,5", kind: EXPENSE, category: " ", when: "14/10" }, TODAY);
  deepEqual(t, { description: "Mercado do bairro", amount: 1500.5, kind: EXPENSE, category: "Outros", date: "2026-10-14" });
  throws(() => makeTransaction({ description: "", amount: "10", kind: EXPENSE, category: "Lazer", when: "" }, TODAY), ValidationError);
  throws(() => makeTransaction({ description: "Algo", amount: "10", kind: "Transferência", category: "Lazer", when: "" }, TODAY), ValidationError);
  throws(() => makeTransaction({ description: "Algo", amount: "x", kind: EXPENSE, category: "Lazer", when: "" }, TODAY), ValidationError);
});

test("períodos, anterior e rótulos", () => {
  deepEqual(periodRange("Mês", TODAY), { name: "Mês", start: "2026-10-01", end: "2026-11-01" });
  deepEqual(periodRange("3 meses", TODAY), { name: "3 meses", start: "2026-08-01", end: "2026-11-01" });
  deepEqual(periodRange("Ano", TODAY), { name: "Ano", start: "2026-01-01", end: "2027-01-01" });
  // Em andamento: compara só o mesmo trecho do anterior.
  deepEqual(previousPeriod(periodRange("Mês", TODAY), TODAY), { name: "Mês", start: "2026-09-01", end: "2026-09-17" });
  deepEqual(previousPeriod(periodRange("3 meses", TODAY), TODAY), { name: "3 meses", start: "2026-05-01", end: "2026-07-17" });
  deepEqual(previousPeriod(periodRange("Ano", TODAY), TODAY), { name: "Ano", start: "2025-01-01", end: "2025-10-17" });
  // Encerrado: compara com o anterior inteiro.
  deepEqual(previousPeriod(periodRange("3 meses", TODAY), "2027-01-01"), { name: "3 meses", start: "2026-05-01", end: "2026-08-01" });
  equal(previousPeriod(periodRange("Tudo", TODAY), TODAY), null);
  equal(describePeriod(periodRange("Mês", TODAY)), "Outubro de 2026");
  equal(describePeriod(periodRange("3 meses", TODAY)), "Agosto a outubro de 2026");
  equal(describePeriod(periodRange("3 meses", "2026-01-05")), "Novembro de 2025 a janeiro de 2026");
  equal(comparisonLabel(periodRange("Mês", TODAY), TODAY), "vs. setembro até dia 16");
  equal(comparisonLabel(periodRange("Mês", TODAY), "2026-12-01"), "vs. setembro");
  equal(comparisonLabel(periodRange("Ano", TODAY), TODAY), "vs. 2025 até 16/10");
});

const sample = () => [
  tx("Salário", 5000, INCOME, "Trabalho", "2026-10-05", 1),
  tx("Aluguel", 1500, EXPENSE, "Moradia", "2026-10-06", 2),
  tx("Mercado", 400.55, EXPENSE, "Alimentação", "2026-10-09", 3),
  tx("Mercado", 99.45, EXPENSE, "Alimentação", "2026-09-20", 4),
  tx("Uber", 50, EXPENSE, "Transporte", "2026-09-02", 5),
];

test("resumo, filtros e ordenação", () => {
  const month = filterTransactions(sample(), { period: periodRange("Mês", TODAY) });
  const s = summarize(month);
  deepEqual([s.income, s.expense, s.balance, s.count], [5000, 1900.55, 3099.45, 3]);
  deepEqual(s.byCategory[0], ["Moradia", 1500]);
  close(s.savings_rate ?? s.savingsRate, 3099.45 / 5000);
  equal(summarize([tx("x", 10)]).savingsRate, null);
  equal(filterTransactions(sample(), { kind: INCOME }).length, 1);
  equal(filterTransactions(sample(), { category: "Alimentação" }).length, 2);
  equal(filterTransactions(sample(), { text: "merc" }).length, 2);
  equal(filterTransactions(sample(), { text: "MORADIA" }).length, 1);
  deepEqual(sortRecent(sample()).map((t) => t.id), [3, 2, 1, 4, 5]);
});

test("série mensal, categorias e variação", () => {
  const series = monthlySeries(sample(), TODAY, 3);
  deepEqual(series.map((m) => m.label), ["Ago", "Set", "Out"]);
  deepEqual([series[1].income, series[1].expense], [0, 149.45]);
  deepEqual([series[2].income, series[2].expense], [5000, 1900.55]);
  const data = Array.from({ length: 8 }, (_, i) => [`C${i}`, 100 - i]);
  const top = topCategories(data, 5);
  equal(top.length, 6);
  deepEqual(top.at(-1), ["Outras", 95 + 94 + 93]);
  deepEqual(topCategories(data.slice(0, 6), 5), data.slice(0, 6));
  close(percentChange(150, 100), 0.5);
  close(percentChange(50, 100), -0.5);
  equal(percentChange(10, 0), null);
});

test("orçamentos: níveis e ordem", () => {
  const month = filterTransactions(sample(), { period: periodRange("Mês", TODAY) });
  const st = budgetStatuses({ Moradia: 1400, Alimentação: 440, Lazer: 300 }, month);
  deepEqual(st.map((s) => s.category), ["Moradia", "Alimentação", "Lazer"]);
  deepEqual(st.map((s) => s.level), ["estourado", "alerta", "ok"]);
  equal(st[0].remaining, -100);
});

test("CSV: exporta e reimporta o mesmo formato do app de computador", () => {
  const items = [tx("Café, com \"leite\"", 8.5, EXPENSE, "Alimentação", "2026-10-03"), tx("Salário", 5000, INCOME, "Trabalho", "2026-10-05")];
  const csv = exportCsv(items);
  assert(csv.startsWith("﻿Data;Descrição;Categoria;Tipo;Valor\r\n"));
  assert(csv.includes("03/10/2026;\"Café, com \"\"leite\"\"\";Alimentação;Despesa;-8,50"));
  const { items: back, skipped } = importCsv(csv, TODAY);
  equal(skipped, 0);
  deepEqual(back, [
    { description: "Café, com \"leite\"", amount: 8.5, kind: EXPENSE, category: "Alimentação", date: "2026-10-03" },
    { description: "Salário", amount: 5000, kind: INCOME, category: "Trabalho", date: "2026-10-05" },
  ]);
  const messy = importCsv("Data;Descrição;Categoria;Tipo;Valor\r\n03/10/2026;Ok;Lazer;Despesa;-10,00\r\nxx;Ruim;Lazer;Despesa;-5,00\r\n;;;;\r\n", TODAY);
  equal(messy.items.length, 1);
  equal(messy.skipped, 1);
  equal(importCsv("coluna;qualquer\r\n1;2", TODAY).items.length, 0);
});

test("dados de demonstração são coerentes", () => {
  const demo = demoTransactions(TODAY);
  assert(demo.length > 100, `poucos itens: ${demo.length}`);
  assert(demo.every((t) => t.date <= TODAY && t.amount > 0));
  deepEqual(demoTransactions(TODAY).slice(0, 5), demo.slice(0, 5), "determinístico");
});

export const outcome = report();
