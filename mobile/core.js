// Regras financeiras do Titanium (versão mobile) — sem dependência de interface.
// Espelha titanium/core.py: mesmas regras de valores, datas, períodos e orçamentos.
// Datas são sempre strings ISO "AAAA-MM-DD" (ordenam como texto e não sofrem com fuso horário).

export const INCOME = "Receita";
export const EXPENSE = "Despesa";
export const KINDS = [EXPENSE, INCOME];

export const CATEGORIES = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Educação", "Lazer",
  "Tecnologia", "Cartão", "Trabalho", "Investimentos", "Outros",
];
export const DEFAULT_CATEGORY = { [EXPENSE]: "Alimentação", [INCOME]: "Trabalho" };
export const PERIODS = ["Mês", "3 meses", "Ano", "Tudo"];

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MAX_AMOUNT = 1_000_000_000;
export const BUDGET_WARNING = 0.9;

export class ValidationError extends Error {}

// ------------------------------------------------------------------ valores

/** Converte o que o usuário digitou em reais: "150", "150,5", "150.50", "1.500", "1.500,50", "R$ 1.500,50". */
export function parseAmount(text) {
  let raw = String(text ?? "").trim().replace(/R\$/g, "").replace(/[\s ]/g, "");
  if (!raw) throw new ValidationError("Informe um valor.");
  if (raw.startsWith("-")) throw new ValidationError("O valor deve ser maior que zero.");
  const invalid = () => new ValidationError("Valor inválido. Use números, como 150,50.");
  if (!/^[\d.,]+$/.test(raw)) throw invalid();

  const count = (ch) => raw.split(ch).length - 1;
  if (raw.includes(",") && raw.includes(".")) {
    // O separador que aparece por último é o decimal.
    raw = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    if (count(",") > 1) throw invalid();
    raw = raw.replace(",", ".");
  } else if (count(".") > 1 || /^\d{1,3}\.\d{3}$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) throw invalid();
  if (value <= 0) throw new ValidationError("O valor deve ser maior que zero.");
  if (value >= MAX_AMOUNT) throw new ValidationError("Valor alto demais.");
  return round2(value);
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function groupThousands(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 1350.5 → "R$ 1.350,50"; com signed → "+ R$ 1.350,50". */
export function formatBrl(value, { signed = false, cents = true } = {}) {
  const v = round2(value || 0);
  const [int, dec] = Math.abs(v).toFixed(cents ? 2 : 0).split(".");
  const number = groupThousands(int) + (dec ? `,${dec}` : "");
  if (signed) return `${v >= 0 ? "+" : "−"} R$ ${number}`;
  return `${v < 0 ? "−" : ""}R$ ${number}`;
}

/** Valor curto para eixos e rótulos: "R$ 6,9 mil" (ou "6,9 mil"). */
export function formatCompact(value, { currency = true } = {}) {
  const v = Math.abs(value);
  let text;
  if (v >= 1_000_000) text = `${(v / 1_000_000).toFixed(1)} mi`.replace(".", ",").replace(",0 mi", " mi");
  else if (v >= 1_000) text = `${(v / 1_000).toFixed(1)} mil`.replace(".", ",").replace(",0 mil", " mil");
  else text = v.toFixed(0);
  return currency ? `R$ ${text}` : text;
}

// -------------------------------------------------------------------- datas

const pad = (n) => String(n).padStart(2, "0");
export const toIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function realDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return toIso(y, m, d);
}

export function todayIso(now = new Date()) {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const parts = (iso) => iso.split("-").map(Number);
const utc = (iso) => Date.UTC(...(([y, m, d]) => [y, m - 1, d])(parts(iso)));
const fromUtc = (ms) => { const d = new Date(ms); return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };

export const addDays = (iso, days) => fromUtc(utc(iso) + days * 86_400_000);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** Aceita "14/10/2026", "14/10/26", "14/10", "2026-10-14", "hoje" e "ontem". Vazio = hoje. */
export function parseDate(text, today = todayIso()) {
  const raw = String(text ?? "").trim().toLowerCase();
  if (raw === "" || raw === "hoje") return today;
  if (raw === "ontem") return addDays(today, -1);

  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const iso = realDate(+m[1], +m[2], +m[3]);
    if (iso) return iso;
  }
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    if (m[3] && m[3].length === 2) y += 2000;
    const iso = realDate(y, +m[2], +m[1]);
    if (iso) return iso;
  }
  throw new ValidationError("Data inválida. Use DD/MM/AAAA (ex.: 14/10/2026).");
}

export function formatDate(iso, { short = false } = {}) {
  const [y, m, d] = parts(iso);
  return short ? `${pad(d)}/${pad(m)}` : `${pad(d)}/${pad(m)}/${y}`;
}

export const monthStart = (iso) => `${iso.slice(0, 7)}-01`;

/** Primeiro dia do mês `months` meses depois (ou antes) de `iso`. */
export function addMonths(iso, months) {
  const [y, m] = parts(iso);
  const index = y * 12 + (m - 1) + months;
  return toIso(Math.floor(index / 12), (index % 12) + 1, 1);
}

export const monthName = (iso) => MONTHS[parts(iso)[1] - 1];
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- períodos

export function periodRange(name, today = todayIso()) {
  const first = monthStart(today);
  const year = +today.slice(0, 4);
  switch (name) {
    case "Mês": return { name, start: first, end: addMonths(first, 1) };
    case "3 meses": return { name, start: addMonths(first, -2), end: addMonths(first, 1) };
    case "Ano": return { name, start: toIso(year, 1, 1), end: toIso(year + 1, 1, 1) };
    case "Tudo": return { name, start: null, end: null };
    default: throw new Error(`período desconhecido: ${name}`);
  }
}

export const periodContains = (p, iso) => (p.start === null || iso >= p.start) && (p.end === null || iso < p.end);

/**
 * O período anterior, para comparar. Se o atual ainda está em andamento, compara só
 * o mesmo trecho do anterior (1º a 19 de outubro contra 1º a 19 de setembro).
 */
export function previousPeriod(period, today = todayIso()) {
  if (period.start === null) return null;
  const start = period.name === "Ano"
    ? toIso(+period.start.slice(0, 4) - 1, 1, 1)
    : addMonths(period.start, period.name === "3 meses" ? -3 : -1);
  let end = period.start;
  if (periodContains(period, today)) {
    const partial = addDays(start, daysBetween(period.start, today) + 1);
    if (partial < end) end = partial;
  }
  return { name: period.name, start, end };
}

export function describePeriod(period) {
  if (period.start === null) return "Todo o histórico";
  if (period.name === "Ano") return period.start.slice(0, 4);
  const last = addMonths(period.end, -1);
  if (period.name === "Mês") return `${capitalize(monthName(last))} de ${last.slice(0, 4)}`;
  const first = period.start;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${capitalize(monthName(first))} a ${monthName(last)} de ${last.slice(0, 4)}`;
  return `${capitalize(monthName(first))} de ${first.slice(0, 4)} a ${monthName(last)} de ${last.slice(0, 4)}`;
}

export function comparisonLabel(period, today = todayIso()) {
  const partial = period.start !== null && periodContains(period, today);
  if (period.name === "Mês") {
    const label = `vs. ${monthName(addMonths(period.start, -1))}`;
    return partial ? `${label} até dia ${+today.slice(8)}` : label;
  }
  if (period.name === "3 meses") return partial ? "vs. mesmo trecho anterior" : "vs. 3 meses anteriores";
  if (period.name === "Ano") {
    const label = `vs. ${+period.start.slice(0, 4) - 1}`;
    return partial ? `${label} até ${formatDate(today, { short: true })}` : label;
  }
  return "";
}

// ------------------------------------------------------------- movimentações

export const signed = (t) => (t.kind === INCOME ? t.amount : -t.amount);

/** Valida os campos digitados e devolve uma movimentação pronta para salvar (sem id). */
export function makeTransaction({ description, amount, kind, category, when, recurring = false, until = "" }, today = todayIso()) {
  const desc = String(description ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (!desc) throw new ValidationError("Informe uma descrição.");
  if (desc.length > 120) throw new ValidationError("A descrição pode ter no máximo 120 caracteres.");
  if (!KINDS.includes(kind)) throw new ValidationError("O tipo deve ser Receita ou Despesa.");
  const value = typeof amount === "number" ? round2(amount) : parseAmount(amount);
  if (!(value > 0)) throw new ValidationError("O valor deve ser maior que zero.");
  const cat = String(category ?? "").split(/\s+/).filter(Boolean).join(" ") || "Outros";
  const date = parseDate(when ?? "", today);
  const isFixed = Boolean(recurring);
  let end = null;
  if (isFixed && until) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(until)) throw new ValidationError("Mês final inválido.");
    if (until < date.slice(0, 7)) throw new ValidationError("O fim do lançamento fixo não pode ser antes do início.");
    end = until;
  }
  return { description: desc, amount: value, kind, category: cat, date, recurring: isFixed, until: end };
}

// ------------------------------------------------- lançamentos fixos (mensais)
// Um lançamento "fixo" é guardado uma única vez (data = primeira ocorrência) e se repete todo mês,
// no mesmo dia (ou no último dia do mês quando o mês é mais curto), até o mês `until` (opcional).

const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Data em que o lançamento cai no mês que começa em `monthIso`, ou null se não cai nele. */
export function occurrenceDate(t, monthIso) {
  const start = monthStart(t.date);
  if (!t.recurring) return start === monthIso ? t.date : null;
  if (monthIso < start) return null;
  if (t.until && monthIso.slice(0, 7) > t.until) return null;
  if (monthIso === start) return t.date;
  const [y, m] = parts(monthIso);
  return toIso(y, m, Math.min(+t.date.slice(8), lastDayOf(y, m)));
}

/**
 * Lançamentos concretos entre `start` (inclusive) e `end` (exclusivo); os fixos viram uma ocorrência por mês.
 * `cap` limita a uma data máxima (inclusive), normalmente hoje. start/end nulos = sem limite
 * (começo = lançamento mais antigo; fim = `cap`).
 */
export function expandRange(items, start, end, cap = null) {
  let to = end;
  if (cap !== null) { const capEnd = addDays(cap, 1); if (to === null || capEnd < to) to = capEnd; }
  if (to === null) to = addDays(todayIso(), 1);
  const from = start ?? items.reduce((min, t) => (t.date < min ? t.date : min), to);

  const out = [];
  for (const t of items) {
    if (!t.recurring) { if (t.date >= from && t.date < to) out.push(t); continue; }
    for (let m = monthStart(from < t.date ? t.date : from); m < to; m = addMonths(m, 1)) {
      const d = occurrenceDate(t, m);
      if (d && d >= from && d < to) out.push({ ...t, date: d });
    }
  }
  return out;
}

/** Os lançamentos de um período, já com as repetições dos fixos, até `today`. */
export const transactionsIn = (items, period, today = todayIso()) => expandRange(items, period.start, period.end, today);

/** Começos de mês para o seletor "mês a mês": `back` meses antes de hoje até `ahead` depois (vira o ano sozinho). */
export function upcomingMonths(today = todayIso(), back = 1, ahead = 12) {
  const first = monthStart(today);
  return Array.from({ length: back + ahead + 1 }, (_, i) => addMonths(first, i - back));
}

/** "Nov" no ano atual; "Jan/27" em outro ano. */
export function monthLabel(monthIso, today = todayIso()) {
  const [y, m] = parts(monthIso);
  return y === +today.slice(0, 4) ? MONTHS_SHORT[m - 1] : `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}

export const describeMonth = (monthIso) => `${capitalize(monthName(monthIso))} de ${monthIso.slice(0, 4)}`;

/** Tudo o que cai num mês (realizado e previsto), separado em fixo e avulso. */
export function monthOverview(items, monthIso, today = todayIso()) {
  const list = expandRange(items, monthIso, addMonths(monthIso, 1)).sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const sum = (pred) => round2(list.filter(pred).reduce((a, t) => a + t.amount, 0));
  const income = sum((t) => t.kind === INCOME), expense = sum((t) => t.kind === EXPENSE);
  const fixedExpense = sum((t) => t.kind === EXPENSE && t.recurring);
  const current = monthStart(today);
  return {
    month: monthIso, items: list, income, expense, balance: round2(income - expense),
    fixedExpense, oneOffExpense: round2(expense - fixedExpense),
    fixedIncome: sum((t) => t.kind === INCOME && t.recurring),
    commitment: income > 0 ? fixedExpense / income : null,
    status: monthIso > current ? "futuro" : monthIso === current ? "atual" : "passado",
  };
}

export function filterTransactions(items, { period = null, kind = null, category = null, text = "" } = {}) {
  const needle = text.trim().toLocaleLowerCase("pt-BR");
  return items.filter((t) =>
    (!period || periodContains(period, t.date)) &&
    (!kind || t.kind === kind) &&
    (!category || t.category === category) &&
    (!needle || t.description.toLocaleLowerCase("pt-BR").includes(needle) || t.category.toLocaleLowerCase("pt-BR").includes(needle)));
}

/** Da mais recente para a mais antiga. */
export const sortRecent = (items) => [...items].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));

export function summarize(items) {
  let income = 0, expense = 0;
  const cats = new Map();
  for (const t of items) {
    if (t.kind === INCOME) income += t.amount;
    else { expense += t.amount; cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount); }
  }
  const byCategory = [...cats].map(([c, v]) => [c, round2(v)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  income = round2(income); expense = round2(expense);
  const balance = round2(income - expense);
  return { income, expense, balance, count: items.length, byCategory, savingsRate: income > 0 ? balance / income : null };
}

/** As `limit` maiores categorias; o resto vira "Outras". */
export function topCategories(byCategory, limit = 5) {
  if (byCategory.length <= limit + 1) return byCategory.slice();
  const rest = round2(byCategory.slice(limit).reduce((sum, [, v]) => sum + v, 0));
  return [...byCategory.slice(0, limit), ["Outras", rest]];
}

export const percentChange = (current, previous) => (previous === 0 ? null : (current - previous) / Math.abs(previous));

/** Receitas e despesas dos `months` meses que terminam em `lastMonth`. */
export function monthlySeries(items, lastMonth, months = 6, today = todayIso()) {
  const first = addMonths(monthStart(lastMonth), -(months - 1));
  const buckets = new Map();
  for (let i = 0; i < months; i++) buckets.set(addMonths(first, i), { income: 0, expense: 0 });
  for (const t of expandRange(items, first, addMonths(first, months), today)) {
    const b = buckets.get(monthStart(t.date));
    if (b) b[t.kind === INCOME ? "income" : "expense"] += t.amount;
  }
  return [...buckets].map(([month, b]) => ({ month, label: MONTHS_SHORT[parts(month)[1] - 1], income: round2(b.income), expense: round2(b.expense) }));
}

// ---------------------------------------------------------------- orçamentos

export function budgetLevel(ratio) {
  if (ratio > 1) return "estourado";
  if (ratio >= BUDGET_WARNING) return "alerta";
  return "ok";
}

/** Situação de cada orçamento, do mais apertado para o mais folgado. */
export function budgetStatuses(budgets, monthItems) {
  const spent = new Map(summarize(monthItems).byCategory);
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const s = spent.get(category) ?? 0;
      const ratio = s / limit;
      return { category, spent: s, limit, ratio, level: budgetLevel(ratio), remaining: round2(limit - s) };
    })
    .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category, "pt-BR"));
}

// -------------------------------------------------------------------- CSV

const csvCell = (text) => (/[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** CSV que abre direto no Excel em português (";" e vírgula decimal) — o mesmo do app de computador. */
export function exportCsv(items) {
  const rows = [["Data", "Descrição", "Categoria", "Tipo", "Valor", "Recorrência", "Até"]];
  for (const t of items) {
    rows.push([formatDate(t.date), t.description, t.category, t.kind, signed(t).toFixed(2).replace(".", ","),
      t.recurring ? "Fixo" : "Avulso", t.until ?? ""]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function splitCsv(text, delimiter) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** Lê o CSV exportado pelo app de computador ou pelo celular. Linhas inválidas são ignoradas. */
export function importCsv(text, today = todayIso()) {
  const rows = splitCsv(text.replace(/^﻿/, ""), ";");
  if (!rows.length) return { items: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLocaleLowerCase("pt-BR"));
  const col = (name) => header.indexOf(name);
  const [iDate, iDesc, iCat, iKind, iValue, iRec, iUntil] = ["data", "descrição", "categoria", "tipo", "valor", "recorrência", "até"].map(col);
  if ([iDate, iDesc, iValue].includes(-1)) return { items: [], skipped: rows.length - 1 };

  const items = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    try {
      const raw = (row[iValue] ?? "").trim();
      const kindText = iKind >= 0 ? (row[iKind] ?? "").trim().toLocaleLowerCase("pt-BR") : "";
      const kind = kindText ? (kindText === "receita" ? INCOME : EXPENSE) : raw.startsWith("-") ? EXPENSE : INCOME;
      items.push(makeTransaction({
        description: row[iDesc], amount: raw.replace(/^[-+−]\s*/, ""), kind,
        category: iCat >= 0 ? row[iCat] : "", when: row[iDate] ?? "",
        recurring: iRec >= 0 && (row[iRec] ?? "").trim().toLocaleLowerCase("pt-BR") === "fixo",
        until: iUntil >= 0 ? (row[iUntil] ?? "").trim() : "",
      }, today));
    } catch { skipped++; }
  }
  return { items, skipped };
}

// -------------------------------------------------------------- demonstração

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHLY = [
  ["Conta de luz", "Moradia", 140, 230, [12]], ["Supermercado", "Alimentação", 180, 340, [3, 14, 24]],
  ["Padaria", "Alimentação", 18, 45, [2, 9, 17, 27]], ["Uber", "Transporte", 18, 46, [4, 11, 15, 22]],
  ["Combustível", "Transporte", 150, 220, [8, 23]], ["Farmácia", "Saúde", 35, 120, [19]],
  ["Cinema", "Lazer", 40, 80, [13]], ["Restaurante", "Lazer", 60, 150, [20, 28]],
  ["Fatura do cartão", "Cartão", 250, 520, [25]],
];
// Guardados uma vez só e repetidos todo mês (lançamentos fixos).
const FIXED = [
  ["Salário", "Trabalho", 6500, INCOME, 5], ["Aluguel", "Moradia", 1450, EXPENSE, 6],
  ["Internet", "Tecnologia", 99.9, EXPENSE, 10], ["Curso online", "Educação", 89.9, EXPENSE, 15],
  ["Academia", "Saúde", 119.9, EXPENSE, 8],
];
export const DEMO_BUDGETS = { Moradia: 1700, Alimentação: 1000, Transporte: 400, Lazer: 300, Saúde: 200 };

/** Um ano de movimentações de exemplo, para conhecer o app sem digitar nada. */
export function demoTransactions(today = todayIso(), months = 12, seed = 7) {
  const rng = mulberry32(seed);
  const firstMonth = addMonths(monthStart(today), -(months - 1));
  const items = FIXED.map(([description, category, amount, kind, day]) => ({
    description, category, kind, amount, date: addDays(firstMonth, day - 1), recurring: true, until: null,
  }));
  for (let back = months - 1; back >= 0; back--) {
    const first = addMonths(monthStart(today), -back);
    const rows = [];
    if (back % 3 === 0) rows.push(["Projeto freelance", "Trabalho", 450, 900, [18], INCOME]);
    for (const r of MONTHLY) rows.push([...r, EXPENSE]);
    for (const [description, category, low, high, days, kind] of rows) {
      for (const d of days) {
        const date = addDays(first, d - 1);
        if (date > today || date.slice(0, 7) !== first.slice(0, 7)) continue;
        items.push({ description, category, kind, date, amount: low === high ? low : round2(low + rng() * (high - low)), recurring: false, until: null });
      }
    }
  }
  return items;
}
