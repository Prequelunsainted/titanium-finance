import {
  EXPENSE, INCOME, ValidationError,
  addMonths, budgetStatuses, comparisonLabel, demoTransactions, describeMonth, describePeriod, exportCsv,
  expandRange, filterTransactions, formatBrl, formatCompact, formatDate, importCsv, makeTransaction, monthLabel,
  monthOverview, monthlySeries, occurrenceDate, parseAmount, parseDate, percentChange, periodRange,
  previousPeriod, sortRecent, summarize, topCategories, transactionsIn, upcomingMonths,
  FINANCING_SYSTEMS, cardUsage, compareSystems, dailyBalances, financingSchedule, financingSummary,
  makeFinancing, monthlyRate, parseBankText,
} from "../core.js";
import { PIN_RE, b64ToBytes, bytesToB64, hashPin, lockoutSeconds, verifyPin } from "../security.js";
import { backupData, defaults, sanitize } from "../store.js";
import { ICON_NAMES, badge, categoryMeta, icon, typeMeta } from "../icons.js";
import { CROP_MAX_ZOOM, centerCrop, cropSource, fitCrop, zoomCrop } from "../util.js";
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
  deepEqual(t, { description: "Mercado do bairro", amount: 1500.5, kind: EXPENSE, category: "Outros", date: "2026-10-14", recurring: false, until: null, type: "", subcategory: "", plan: null });
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
  assert(csv.startsWith("\ufeffData;Descrição;Categoria;Tipo;Valor;Recorrência;Até;Subcategoria;Nome do tipo\r\n"));
  assert(csv.includes("03/10/2026;\"Café, com \"\"leite\"\"\";Alimentação;Despesa;-8,50;Avulso;"));
  const { items: back, skipped } = importCsv(csv, TODAY);
  equal(skipped, 0);
  deepEqual(back, [
    { description: "Café, com \"leite\"", amount: 8.5, kind: EXPENSE, category: "Alimentação", date: "2026-10-03", recurring: false, until: null, type: "", subcategory: "", plan: null },
    { description: "Salário", amount: 5000, kind: INCOME, category: "Trabalho", date: "2026-10-05", recurring: false, until: null, type: "", subcategory: "", plan: null },
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
  deepEqual(makeTransaction({ ...base, recurring: true, until: "2027-03" }, TODAY), { description: "Academia", amount: 120, kind: EXPENSE, category: "Saúde", date: "2026-10-10", recurring: true, until: "2027-03", type: "", subcategory: "", plan: null });
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


// ---------------------------------------------------------- financiamentos

const sumPayments = (rows) => Math.round(rows.reduce((a, r) => a + r.payment, 0) * 100) / 100;

test("Price: parcela fixa, saldo zera e juros batem com a fórmula", () => {
  const rows = financingSchedule({ system: "price", principal: 10000, rate: 1, count: 12 }, "2026-11-10");
  equal(rows.length, 12);
  equal(rows[0].payment, 888.49);
  assert(rows.slice(0, 11).every((r) => r.payment === 888.49), "parcelas iguais");
  equal(rows.at(-1).balance, 0);
  close(rows[0].interest, 100, "juros do 1º mês", 0.005);
  close(sumPayments(rows) - 10000, 661.86, "juros totais", 0.05);
  equal(rows[11].date, "2027-10-10");
  // Em toda linha: saldo anterior - amortização = saldo novo.
  let balance = 10000;
  for (const r of rows) { close(balance - r.amortization, r.balance, `linha ${r.n}`, 0.006); balance = r.balance; }
});

test("SAC: amortização constante e parcela que diminui", () => {
  const rows = financingSchedule({ system: "sac", principal: 1000, rate: 2, count: 4 }, "2026-11-05");
  deepEqual(rows.map((r) => r.payment), [270, 265, 260, 255]);
  deepEqual(rows.map((r) => r.amortization), [250, 250, 250, 250]);
  equal(sumPayments(rows), 1050);
  equal(rows.at(-1).balance, 0);
});

test("Sem juros: divide igual e a última parcela fecha os centavos", () => {
  const rows = financingSchedule({ system: "sem-juros", principal: 1000, rate: 0, count: 3 }, "2026-11-05");
  deepEqual(rows.map((r) => r.payment), [333.33, 333.33, 333.34]);
  equal(sumPayments(rows), 1000);
});

test("vencimento no dia 31 cai no último dia dos meses curtos", () => {
  const rows = financingSchedule({ system: "sem-juros", principal: 400, rate: 0, count: 4 }, "2026-01-31");
  deepEqual(rows.map((r) => r.date), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("taxa ao ano vira taxa ao mês e Price x SAC se comparam", () => {
  close(monthlyRate(12.6825, "ano"), 1, "12,68% a.a. ≈ 1% a.m.", 0.001);
  equal(monthlyRate(1.5, "mes"), 1.5);
  const c = compareSystems(10000, 1, 12, "2026-11-10");
  assert(c.sac.first > c.price.first && c.sac.last < c.price.last, "SAC começa mais alto e termina mais baixo");
  assert(c.sac.interest < c.price.interest, "SAC paga menos juros no total");
});

test("makeFinancing valida e vira parcelas nos meses", () => {
  const base = { description: "Moto", principal: "12.000", entry: "3.000", rate: "1,2", count: 36, system: "price", when: "20/08/2026", category: "Transporte" };
  const f = makeFinancing(base, TODAY);
  equal(f.kind, EXPENSE);
  equal(f.plan.principal, 12000);
  equal(f.plan.entry, 3000);
  equal(f.plan.count, 36);
  equal(f.amount, financingSchedule(f.plan, f.date)[0].payment);
  throws(() => makeFinancing({ ...base, count: 0 }, TODAY), ValidationError);
  throws(() => makeFinancing({ ...base, count: 600 }, TODAY), ValidationError);
  throws(() => makeFinancing({ ...base, system: "x" }, TODAY), ValidationError);
  throws(() => makeFinancing({ ...base, rate: "80" }, TODAY), ValidationError);
  throws(() => makeFinancing({ ...base, description: "" }, TODAY), ValidationError);
  equal(makeFinancing({ ...base, system: "sem-juros", rate: "" }, TODAY).plan.rate, 0);
  const yearly = makeFinancing({ ...base, rate: "12,6825", rateUnit: "ano" }, TODAY);
  close(yearly.plan.rate, 1, "convertida", 0.001);

  const item = { id: 5, ...f };
  const upTo = transactionsIn([item], periodRange("Tudo", TODAY), TODAY);
  equal(upTo.length, 2, "só ago e set venceram até 16/10 (a de out vence dia 20)");
  equal(transactionsIn([item], periodRange("Tudo", "2026-10-20"), "2026-10-20").length, 3, "no dia 20 a de outubro entra");
});

test("parcelas entram nas contas do mês e comprometem a renda", () => {
  const f = { id: 7, ...makeFinancing({ description: "Carro", principal: 1200, rate: "", count: 12, system: "sem-juros", when: "2026-10-20", category: "Transporte" }, TODAY) };
  const salary = { id: 8, description: "Salário", amount: 5000, kind: INCOME, category: "Trabalho", date: "2026-10-05", recurring: true, until: null };
  const nov = monthOverview([f, salary], "2026-11-01", TODAY);
  equal(nov.installmentExpense, 100);
  equal(nov.committed, 100);
  close(nov.commitment, 0.02);
  const item = nov.items.find((t) => t.plan);
  deepEqual([item.installment, item.installments], [2, 12]);
  equal(monthOverview([f, salary], "2027-09-01", TODAY).installmentExpense, 100, "12ª e última parcela");
  equal(monthOverview([f, salary], "2027-10-01", TODAY).installmentExpense, 0, "acabou");
});

test("resumo do financiamento: pago, a pagar e saldo devedor", () => {
  const f = makeFinancing({ description: "Moto", principal: 1000, rate: "", count: 4, system: "sem-juros", when: "2026-08-20", category: "Transporte" }, TODAY);
  const s = financingSummary(f, TODAY);
  deepEqual([s.paidCount, s.remainingCount, s.paidTotal, s.remainingTotal, s.balance], [2, 2, 500, 500, 500]);
  equal(s.next.date, "2026-10-20");
  equal(s.done, false);
  equal(financingSummary(f, "2027-01-01").done, true);
  equal(financingSummary(f, "2026-01-01").balance, 1000);
  assert(Object.keys(FINANCING_SYSTEMS).length === 3);
});

// ---------------------------------------------------------- saldo do dia

test("saldo do dia: anterior + lançamentos do dia = saldo do dia, sempre", () => {
  const items = [tx("A", 100, EXPENSE, "X", "2026-10-02", 1), tx("B", 30, EXPENSE, "X", "2026-10-02", 2),
    { ...tx("S", 500, INCOME, "T", "2026-10-05", 3) }, tx("C", 20.1, EXPENSE, "X", "2026-10-09", 4)];
  const days = dailyBalances(items, 1000);
  deepEqual(days.map((d) => d.date), ["2026-10-02", "2026-10-05", "2026-10-09"]);
  deepEqual(days.map((d) => d.before), [1000, 870, 1370]);
  deepEqual(days.map((d) => d.change), [-130, 500, -20.1]);
  deepEqual(days.map((d) => d.after), [870, 1370, 1349.9]);
  days.forEach((d, i) => { close(d.before + d.change, d.after, `dia ${d.date}`, 1e-9); if (i) equal(d.before, days[i - 1].after); });
  equal(dailyBalances([], 50).length, 0);
});

// ---------------------------------------------------------- cartão

test("limite do cartão considera só a fatura aberta e o nome do tipo", () => {
  const card = { name: "Cartão Nubank", limit: 1000, closingDay: 25, dueDay: 5 };
  const on = (date, amount, type = "Cartão Nubank", extra = {}) => ({ ...tx("x", amount, EXPENSE, "Lazer", date, 1), type, ...extra });
  const items = [on("2026-09-25", 999), on("2026-09-26", 200), on("2026-10-10", 300), on("2026-10-20", 100), on("2026-10-26", 50), on("2026-10-12", 80, "Pix")];
  const u = cardUsage(card, items, TODAY);
  equal(u.used, 600);
  equal(u.available, 400);
  equal(u.closing, "2026-10-25");
  equal(u.daysToClosing, 9);
  equal(u.due, "2026-11-05");
  equal(u.level, "ok");
  // Depois do fechamento a fatura aberta passa a ser a seguinte.
  const after = cardUsage(card, items, "2026-10-26");
  equal(after.closing, "2026-11-25");
  equal(after.used, 50);
  equal(cardUsage({ ...card, limit: 650 }, items, TODAY).level, "alerta");
  equal(cardUsage({ ...card, limit: 500 }, items, TODAY).level, "estourado");
});

// ---------------------------------------------------------- tipo e subcategoria

test("nome do tipo e subcategoria: guardados, filtrados e somados", () => {
  const t = makeTransaction({ description: "Almoço", amount: "42", kind: EXPENSE, category: "Alimentação", when: "10/10", type: "  Pix   Itaú ", subcategory: "Restaurante" }, TODAY);
  equal(t.type, "Pix Itaú");
  equal(t.subcategory, "Restaurante");
  const items = [{ id: 1, ...t }, { id: 2, ...t, subcategory: "Mercado", type: "Cartão", amount: 100 }, { id: 3, ...t, subcategory: "", amount: 8 }];
  equal(filterTransactions(items, { type: "Pix Itaú" }).length, 2);
  equal(filterTransactions(items, { text: "restau" }).length, 1, "busca acha subcategoria");
  equal(filterTransactions(items, { text: "cartão" }).length, 1, "busca acha o nome do tipo");
  const s = summarize(items);
  deepEqual(s.byCategory, [["Alimentação", 150]]);
  deepEqual(s.bySubcategory, [["Alimentação › Mercado", 100], ["Alimentação › Restaurante", 42], ["Alimentação", 8]]);
});

test("CSV leva subcategoria, nome do tipo e as parcelas já vencidas", () => {
  const items = [{ id: 1, ...makeTransaction({ description: "Almoço", amount: "42", kind: EXPENSE, category: "Alimentação", when: "10/10/2026", type: "Pix", subcategory: "Restaurante" }, TODAY) },
    { id: 2, ...makeFinancing({ description: "Moto", principal: 600, rate: "", count: 3, system: "sem-juros", when: "2026-09-20", category: "Transporte" }, TODAY) }];
  const csv = exportCsv(items, TODAY);
  assert(csv.includes("10/10/2026;Almoço;Alimentação;Despesa;-42,00;Avulso;;Restaurante;Pix"));
  assert(csv.includes("20/09/2026;Moto (1/3);Transporte;Despesa;-200,00;Avulso;;;"));
  assert(csv.includes("20/10/2026") === false, "parcela de outubro ainda não venceu em 16/10");
  const back = importCsv(csv, TODAY).items;
  deepEqual([back[0].type, back[0].subcategory], ["Pix", "Restaurante"]);
});

// ---------------------------------------------------------- texto do banco

test("notificação do banco: Pix recebido é receita, enviado é despesa", () => {
  const a = parseBankText("Você recebeu um Pix de Ana Souza no valor de R$ 1.150,50", TODAY);
  deepEqual([a.amount, a.kind, a.type, a.description], [1150.5, INCOME, "Pix", "Ana Souza"]);
  const b = parseBankText("Pix enviado para Mercado Bom R$ 32,90", TODAY);
  deepEqual([b.amount, b.kind, b.type, b.description], [32.9, EXPENSE, "Pix", "Mercado Bom"]);
  const c = parseBankText("Compra aprovada no cartão final 1234 em PADARIA CENTRAL R$ 18,50", TODAY);
  deepEqual([c.amount, c.kind, c.type, c.description], [18.5, EXPENSE, "Cartão de crédito", "PADARIA CENTRAL"]);
  const d = parseBankText("Salário depositado R$ 5.000,00", TODAY);
  deepEqual([d.kind, d.amount], [INCOME, 5000]);
  const e = parseBankText("12/10 Pix recebido R$ 20,00", TODAY);
  deepEqual([e.date, e.kind], ["2026-10-12", INCOME]);
  const f = parseBankText("Saldo atualizado R$ 1.000,00", TODAY);
  equal(f.kind, null, "sem pista: não chuta despesa");
  equal(parseBankText("sem valor nenhum aqui", TODAY).amount, null);
});

// ---------------------------------------------------------- bloqueio (PIN)

test("PIN: guarda só o hash, confere certo e recusa errado", async () => {
  assert(PIN_RE.test("1234") && PIN_RE.test("12345678"));
  assert(!PIN_RE.test("123") && !PIN_RE.test("123456789") && !PIN_RE.test("12a4"));
  const record = await hashPin("2468");
  assert(!JSON.stringify(record).includes("2468"));
  equal(await verifyPin("2468", record), true);
  equal(await verifyPin("2469", record), false);
  equal(await verifyPin("abc", record), false);
  equal(await verifyPin("2468", null), false);
  const other = await hashPin("2468");
  assert(other.hash !== record.hash && other.salt !== record.salt, "sal diferente a cada PIN");
  let failed = false;
  try { await hashPin("12"); } catch { failed = true; }
  assert(failed, "PIN curto é recusado");
});

test("bloqueio: base64url e espera depois de muitos erros", () => {
  const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255, 62, 63]);
  deepEqual([...b64ToBytes(bytesToB64(bytes))], [...bytes]);
  assert(!/[+/=]/.test(bytesToB64(bytes)));
  deepEqual([0, 4, 5, 6, 7, 20].map(lockoutSeconds), [0, 0, 30, 60, 120, 900]);
});

// ---------------------------------------------------------- armazenamento

test("dados salvos por versões antigas continuam valendo (sem os campos novos)", () => {
  const old = { version: 1, nextId: 3, budgets: { Lazer: 300 }, settings: { theme: "dark", period: "Ano", lastKind: "Receita", lastCategory: "Trabalho" },
    transactions: [{ id: 1, description: "Cinema", amount: 50, kind: EXPENSE, category: "Lazer", date: "2026-10-10" },
      { id: 2, description: "Salário", amount: 5000, kind: INCOME, category: "Trabalho", date: "2026-10-05", recurring: true, until: "2027-01" }] };
  const s = sanitize(old);
  equal(s.transactions.length, 2);
  deepEqual([s.transactions[0].recurring, s.transactions[0].type, s.transactions[0].subcategory, s.transactions[0].plan], [false, "", "", null]);
  deepEqual([s.transactions[1].recurring, s.transactions[1].until], [true, "2027-01"]);
  deepEqual([s.settings.theme, s.settings.period, s.settings.lastKind], ["dark", "Ano", INCOME]);
  deepEqual([s.cards, s.types, s.profile.name, s.lock.device, s.lock.pin, s.settings.openingBalance], [[], [], "", null, null, 0]);
  equal(s.nextId, 3);
});

test("armazenamento descarta lixo e valida cartões, financiamentos e bloqueio", () => {
  const plan = { system: "price", principal: 1000, entry: 0, rate: 1.5, count: 12 };
  const s = sanitize({
    transactions: [
      { id: 1, description: "Moto", amount: 90, kind: INCOME, category: "X", date: "2026-10-10", plan },
      { id: 2, description: "Ruim", amount: -5, kind: EXPENSE, category: "X", date: "2026-10-10" },
      { id: 3, description: "Plano ruim", amount: 5, kind: EXPENSE, category: "X", date: "2026-10-10", plan: { ...plan, count: 9999 } },
      { id: "4", description: "Id ruim", amount: 5, kind: EXPENSE, category: "X", date: "2026-10-10" },
      { id: 5, description: "Data ruim", amount: 5, kind: EXPENSE, category: "X", date: "ontem" },
    ],
    cards: [{ name: "Nubank", limit: 1000, closingDay: 25, dueDay: 5 }, { name: "Nubank", limit: 5, closingDay: 1 }, { name: "Sem dia", limit: 5, closingDay: 40 }, { name: "", limit: 5, closingDay: 3 }],
    types: ["Pix", " Pix ", "", 7, "Vale"],
    profile: { name: "  Ana   Maria ", color: "javascript:alert(1)" },
    lock: { device: "AAAA", pin: { salt: 1, hash: "x" }, timeout: 7 },
    settings: { openingBalance: "muito", categoryView: "x", dashboard: { order: ["saldo", 3], visible: { saldo: false, fluxo: "sim" } } },
  });
  deepEqual(s.transactions.map((t) => t.id), [1, 3]);
  equal(s.transactions[0].kind, EXPENSE, "financiamento é sempre despesa");
  equal(s.transactions[1].plan, null, "plano inválido vira lançamento comum");
  deepEqual(s.cards.map((c) => c.name), ["Nubank"]);
  deepEqual(s.types, ["Pix", "Vale"]);
  deepEqual([s.profile.name, s.profile.color], ["Ana Maria", defaults().profile.color]);
  deepEqual([s.lock.device, s.lock.pin, s.lock.timeout], [null, null, 1], "chave curta, PIN malformado e prazo inválido são ignorados");
  deepEqual([s.settings.openingBalance, s.settings.categoryView, s.settings.dashboard.order, s.settings.dashboard.visible], [0, "categoria", ["saldo"], { saldo: false }]);
  equal(sanitize(null).transactions.length, 0);
  equal(sanitize("texto").nextId, 1);
});

test("backup leva tudo, menos o bloqueio e os ids", () => {
  const s = defaults();
  s.lock = { device: "ABCDEFGH12", pin: { salt: "a", hash: "b" }, timeout: 5 };
  s.cards = [{ name: "Nubank", limit: 1000, closingDay: 25, dueDay: 5 }];
  s.transactions = [{ id: 9, description: "Mercado", amount: 10, kind: EXPENSE, category: "Alimentação", date: "2026-10-10", recurring: false, until: null, type: "Pix", subcategory: "", plan: null }];
  const b = backupData(s);
  equal(b.app, "titanium");
  equal(b.version, 2);
  assert(!("lock" in b) && !("nextId" in b));
  assert(!JSON.stringify(b).includes("ABCDEFGH12") && !JSON.stringify(b).includes('"hash"'));
  deepEqual([b.cards.length, "id" in b.transactions[0], b.transactions[0].type], [1, false, "Pix"]);
});

test("ícones: categorias e tipos conhecidos têm ícone e cor fixos", () => {
  deepEqual(categoryMeta("Alimentação"), { icon: "utensils", color: "#F59E0B" });
  deepEqual(categoryMeta("Moradia"), { icon: "home", color: "#60A5FA" });
  equal(typeMeta("Pix").icon, "pix");
  equal(typeMeta("Boleto").icon, "barcode");
  equal(typeMeta("Cartão Nubank", ["Cartão Nubank"]).icon, "card");
  for (const name of ["Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer", "Tecnologia", "Cartão", "Trabalho", "Investimentos", "Outros", "Financiamento"]) {
    assert(ICON_NAMES.includes(categoryMeta(name).icon), name);
  }
});

test("ícones: nomes novos ganham palpite ou ícone genérico com cor estável", () => {
  equal(categoryMeta("Mercado do bairro").icon, categoryMeta("Mercado do bairro").icon);
  const a = categoryMeta("Coisa sem nome xyz"), b = categoryMeta("Coisa sem nome xyz");
  deepEqual(a, b, "a mesma categoria sempre tem a mesma cor");
  assert(ICON_NAMES.includes(a.icon) && /^#[0-9A-F]{6}$/i.test(a.color));
  assert(ICON_NAMES.includes(typeMeta("Vale refeição").icon));
  assert(icon("gear").startsWith("<svg") && icon("nao-existe").startsWith("<svg"), "ícone desconhecido não quebra a tela");
  assert(badge({ icon: "pix", color: "#2DD4BF" }).includes("--ic:#2DD4BF"));
});

test("foto do perfil: só imagem embutida e pequena", () => {
  const ok = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  equal(sanitize({ profile: { name: "Ana", photo: ok } }).profile.photo, ok);
  for (const bad of ["https://exemplo.com/foto.jpg", "data:text/html;base64,PGgxPg==", "data:image/svg+xml;base64,PHN2Zz4=", 'data:image/png;base64,AA"onerror=x', "data:image/png;base64," + "A".repeat(600_000), 42]) {
    equal(sanitize({ profile: { name: "Ana", photo: bad } }).profile.photo, null, String(bad).slice(0, 30));
  }
  equal(defaults().profile.photo, null);
});

test("recorte da foto: começa centralizado e cobre o círculo", () => {
  const v = centerCrop(4000, 3000, 300);
  close(v.scale, 0.1);
  close(v.y, 0);
  close(v.x, -50, "sobra horizontal dividida dos dois lados");
  const src = cropSource(v);
  deepEqual([Math.round(src.sx), Math.round(src.sy), Math.round(src.side)], [500, 0, 3000]);
});

test("recorte da foto: arrastar e dar zoom nunca deixa buraco", () => {
  const v = centerCrop(1000, 2000, 200);
  const far = fitCrop({ ...v, x: 500, y: -99999 });
  deepEqual([far.x, far.y], [0, 200 - 2000 * far.scale], "a imagem para na borda do quadro");
  equal(fitCrop({ ...v, zoom: 0.2 }).zoom, 1, "não afasta além de cobrir o quadro");
  equal(fitCrop({ ...v, zoom: 99 }).zoom, CROP_MAX_ZOOM);
  const z = zoomCrop(v, 2);
  const a = cropSource(v), b = cropSource(z);
  close(a.sx + a.side / 2, b.sx + b.side / 2, "o zoom pelo meio mantém o centro");
  close(a.sy + a.side / 2, b.sy + b.side / 2);
  close(b.side, a.side / 2);
  const under = (view, px, py) => [(px - view.x) / view.scale, (py - view.y) / view.scale];
  const pinch = zoomCrop(v, 3, 50, 120), [ax, ay] = under(fitCrop(v), 50, 120), [bx, by] = under(pinch, 50, 120);
  close(ax, bx, "o ponto da foto sob os dedos fica parado");
  close(ay, by);
  const s = cropSource(zoomCrop(fitCrop({ ...v, x: -40, y: -1300 }), 4.5, 37, 160));
  assert(s.sx >= -1e-9 && s.sy >= -1e-9 && s.sx + s.side <= 1000 + 1e-6 && s.sy + s.side <= 2000 + 1e-6, "recorte sempre dentro da imagem");
});

export const outcome = await report();

