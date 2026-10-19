import {
  EXPENSE, INCOME, ValidationError,
  addMonths, budgetStatuses, comparisonLabel, demoTransactions, describeMonth, describePeriod, exportCsv,
  expandRange, filterTransactions, formatBrl, formatCompact, formatDate, importCsv, makeTransaction, monthLabel,
  monthOverview, monthlySeries, occurrenceDate, parseAmount, parseDate, percentChange, periodRange,
  previousPeriod, sortRecent, summarize, topCategories, transactionsIn, upcomingMonths,
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
  deepEqual(t, { description: "Mercado do bairro", amount: 1500.5, kind: EXPENSE, category: "Outros", date: "2026-10-14", recurring: false, until: null });
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
  assert(csv.startsWith("\ufeffData;Descrição;Categoria;Tipo;Valor;Recorrência;Até\r\n"));
  assert(csv.includes("03/10/2026;\"Café, com \"\"leite\"\"\";Alimentação;Despesa;-8,50;Avulso;"));
  const { items: back, skipped } = importCsv(csv, TODAY);
  equal(skipped, 0);
  deepEqual(back, [
    { description: "Café, com \"leite\"", amount: 8.5, kind: EXPENSE, category: "Alimentação", date: "2026-10-03", recurring: false, until: null },
    { description: "Salário", amount: 5000, kind: INCOME, category: "Trabalho", date: "2026-10-05", recurring: false, until: null },
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
  assert(demo.some((t) => t.recurring) && demo.some((t) => !t.recurring));
  deepEqual(demoTransactions(TODAY).slice(0, 5), demo.slice(0, 5), "determinístico");
});

const fixed = (description, amount, date, extra = {}) => ({ id: 90, description, amount, kind: EXPENSE, category: "Moradia", date, recurring: true, until: null, ...extra });

test("fixo: uma ocorrência por mês, sempre no mesmo dia", () => {
  const rent = fixed("Aluguel", 1500, "2026-08-06");
  equal(occurrenceDate(rent, "2026-07-01"), null, "antes do início");
  equal(occurrenceDate(rent, "2026-08-01"), "2026-08-06");
  equal(occurrenceDate(rent, "2026-11-01"), "2026-11-06");
  equal(occurrenceDate(rent, "2027-03-01"), "2027-03-06", "vira o ano");
  const out = expandRange([rent], "2026-08-01", "2027-01-01");
  deepEqual(out.map((t) => t.date), ["2026-08-06", "2026-09-06", "2026-10-06", "2026-11-06", "2026-12-06"]);
  equal(out.every((t) => t.id === 90 && t.amount === 1500), true);
});

test("fixo no dia 31 cai no último dia dos meses curtos", () => {
  const bill = fixed("Boleto", 100, "2026-01-31");
  equal(occurrenceDate(bill, "2026-02-01"), "2026-02-28");
  equal(occurrenceDate(bill, "2026-04-01"), "2026-04-30");
  equal(occurrenceDate(bill, "2028-02-01"), "2028-02-29");
  equal(occurrenceDate(bill, "2026-03-01"), "2026-03-31");
});

test("fixo respeita o mês de término e o limite de hoje", () => {
  const gym = fixed("Academia", 120, "2026-06-10", { until: "2026-09" });
  deepEqual(expandRange([gym], "2026-01-01", "2027-01-01").map((t) => t.date), ["2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10"]);
  const rent = fixed("Aluguel", 1500, "2026-08-06");
  // Outubro até o dia 16: a ocorrência do dia 6 já caiu; a de novembro ainda não.
  equal(transactionsIn([rent], periodRange("Mês", TODAY), TODAY).length, 1);
  equal(transactionsIn([fixed("Luz", 90, "2026-08-20")], periodRange("Mês", TODAY), TODAY).length, 0, "dia 20 ainda não chegou");
  // "Tudo" vai do primeiro lançamento até hoje.
  equal(transactionsIn([rent], periodRange("Tudo", TODAY), TODAY).length, 3);
});

test("avulso e fixo convivem no mesmo período", () => {
  const items = [tx("Mercado", 100, EXPENSE, "Alimentação", "2026-10-09", 1), fixed("Aluguel", 1500, "2026-08-06")];
  const s = summarize(transactionsIn(items, periodRange("3 meses", TODAY), TODAY));
  equal(s.expense, 1500 * 3 + 100);
});

test("seletor de meses vira o ano sozinho", () => {
  const months = upcomingMonths(TODAY, 1, 12);
  equal(months.length, 14);
  equal(months[0], "2026-09-01");
  equal(months[1], "2026-10-01");
  equal(months[2], "2026-11-01");
  equal(months[3], "2026-12-01");
  equal(months[4], "2027-01-01");
  equal(months.at(-1), "2027-10-01");
  deepEqual(months.slice(0, 5).map((m) => monthLabel(m, TODAY)), ["Set", "Out", "Nov", "Dez", "Jan/27"]);
  // Em janeiro de 2027 o mesmo seletor recomeça com os meses do novo ano.
  deepEqual(upcomingMonths("2027-01-15", 1, 2).map((m) => monthLabel(m, "2027-01-15")), ["Dez/26", "Jan", "Fev", "Mar"]);
  equal(describeMonth("2026-11-01"), "Novembro de 2026");
});

test("visão do mês: fixas, avulsas e comprometimento da renda", () => {
  const items = [
    fixed("Aluguel", 1500, "2026-08-06"),
    { ...fixed("Salário", 5000, "2026-08-05"), kind: INCOME, category: "Trabalho" },
    tx("Show", 300, EXPENSE, "Lazer", "2026-11-14", 3),
    tx("Mercado", 100, EXPENSE, "Alimentação", "2026-10-09", 4),
  ];
  const nov = monthOverview(items, "2026-11-01", TODAY);
  equal(nov.status, "futuro");
  deepEqual([nov.income, nov.expense, nov.balance, nov.fixedExpense, nov.oneOffExpense, nov.fixedIncome], [5000, 1800, 3200, 1500, 300, 5000]);
  close(nov.commitment, 0.3);
  deepEqual(nov.items.map((t) => t.date), ["2026-11-05", "2026-11-06", "2026-11-14"], "ordenado por data");
  equal(monthOverview(items, "2026-10-01", TODAY).status, "atual");
  equal(monthOverview(items, "2026-09-01", TODAY).status, "passado");
  const jan = monthOverview(items, "2027-01-01", TODAY);
  deepEqual([jan.income, jan.expense], [5000, 1500], "só os fixos se repetem em 2027");
  equal(monthOverview([tx("x", 1)], "2026-11-01", TODAY).commitment, null);
});

test("fixo: validações do formulário", () => {
  const base = { description: "Academia", amount: "120", kind: EXPENSE, category: "Saúde", when: "10/10/2026" };
  deepEqual(makeTransaction({ ...base, recurring: true, until: "2027-03" }, TODAY), { description: "Academia", amount: 120, kind: EXPENSE, category: "Saúde", date: "2026-10-10", recurring: true, until: "2027-03" });
  equal(makeTransaction({ ...base, recurring: false, until: "2027-03" }, TODAY).until, null, "avulso ignora o término");
  throws(() => makeTransaction({ ...base, recurring: true, until: "2026-09" }, TODAY), ValidationError);
  throws(() => makeTransaction({ ...base, recurring: true, until: "2027-13" }, TODAY), ValidationError);
});

test("série mensal conta os fixos de cada mês passado", () => {
  const series = monthlySeries([fixed("Aluguel", 1500, "2026-08-06")], TODAY, 4, TODAY);
  deepEqual(series.map((m) => m.expense), [0, 1500, 1500, 1500]);
});

test("CSV leva o lançamento fixo e o término de um lado para o outro", () => {
  const items = [fixed("Aluguel", 1500, "2026-08-06", { until: "2027-07" }), tx("Mercado", 50)];
  const csv = exportCsv(items);
  assert(csv.includes("06/08/2026;Aluguel;Moradia;Despesa;-1500,00;Fixo;2027-07"));
  const { items: back } = importCsv(csv, TODAY);
  deepEqual([back[0].recurring, back[0].until, back[1].recurring, back[1].until], [true, "2027-07", false, null]);
  // CSV antigo (sem as colunas novas) continua valendo: tudo avulso.
  const old = importCsv("Data;Descrição;Categoria;Tipo;Valor\r\n03/10/2026;Café;Lazer;Despesa;-8,50\r\n", TODAY);
  equal(old.items[0].recurring, false);
});

export const outcome = report();
