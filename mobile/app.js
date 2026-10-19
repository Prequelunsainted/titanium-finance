// Interface do Titanium Finance (celular). A lógica financeira fica em core.js.

import {
  CATEGORIES, DEFAULT_CATEGORY, DEMO_BUDGETS, EXPENSE, INCOME, PERIODS, ValidationError,
  addDays, addMonths, budgetStatuses, comparisonLabel, demoTransactions, describeMonth, describePeriod, exportCsv,
  filterTransactions, formatBrl, formatCompact, formatDate, importCsv, makeTransaction, monthLabel, monthName,
  monthOverview, monthlySeries, monthStart, parseAmount, percentChange, periodRange, previousPeriod, signed,
  sortRecent, summarize, todayIso, topCategories, transactionsIn, upcomingMonths,
} from "./core.js";
import { defaults, load, save } from "./store.js";

const VERSION = "2.1.0";
const PAGES = ["Painel", "Meses", "Movimentações", "Orçamentos", "Mais"];
const TITLES = { Painel: "Visão geral", Meses: "Mês a mês", Movimentações: "Lançamentos", Orçamentos: "Orçamentos", Mais: "Mais" };
const THEMES = [["system", "Sistema"], ["light", "Claro"], ["dark", "Escuro"]];
const KIND_FILTERS = [["Todos", null], ["Receitas", INCOME], ["Despesas", EXPENSE]];

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ?demo abre o app com dados de exemplo só na memória (nada é salvo): bom para conhecer ou tirar prints.
// Também aceita &page=Meses, &month=2026-11-01, &theme=dark|light, &scroll=700 e &sheet[&fixo] (abre o formulário).
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

let state = load();
const ui = { page: "Painel", kind: "Todos", category: "", text: "", month: null, monthSel: null, warnedStorage: false, installEvent: null };

if (DEMO) {
  state = defaults();
  addTransactions(demoTransactions());
  state.budgets = { ...DEMO_BUDGETS };
  state.settings.theme = ["light", "dark"].includes(params.get("theme")) ? params.get("theme") : "system";
  if (PAGES.includes(params.get("page"))) ui.page = params.get("page");
  if (/^\d{4}-\d{2}-01$/.test(params.get("month") ?? "")) ui.monthSel = params.get("month");
}

// ------------------------------------------------------------------ estado

function persist() {
  if (DEMO) return;
  if (!save(state) && !ui.warnedStorage) {
    ui.warnedStorage = true;
    toast("Não foi possível guardar os dados neste navegador. Eles serão perdidos ao fechar.");
  }
}

const period = () => periodRange(state.settings.period);
const monthItems = () => transactionsIn(state.transactions, periodRange("Mês"));
const allCategories = () => [...new Set([...CATEGORIES, ...state.transactions.map((t) => t.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));

function addTransactions(items) {
  for (const t of items) state.transactions.push({ id: state.nextId++, ...t });
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}

// ----------------------------------------------------------------- aparência

function applyTheme() {
  const theme = state.settings.theme;
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  // A barra do navegador acompanha a cor de fundo do app.
  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
  });
}

// ------------------------------------------------------------------- painel

const CATEGORY_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function flowChart(series, selected) {
  const W = 320, H = 150, left = 30, bottom = 20, top = 10;
  const plotW = W - left, plotH = H - bottom - top;
  const peak = Math.max(...series.map((m) => Math.max(m.income, m.expense)));
  if (!peak) return `<p class="empty">Sem movimentações nos últimos meses.</p>`;
  const step = niceStep(peak / 3), max = step * Math.ceil(peak / step);
  const y = (v) => top + plotH - (v / max) * plotH;
  const group = plotW / series.length, barW = Math.min(11, group * 0.34);

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês">`;
  for (let v = 0; v <= max + 1e-9; v += step) {
    svg += `<line class="grid" x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 5}" y="${y(v) + 3}" text-anchor="end">${v ? formatCompact(v, { currency: false }) : "0"}</text>`;
  }
  series.forEach((m, i) => {
    const cx = left + group * i + group / 2, dim = i === selected ? "" : " dim";
    const h1 = Math.max(m.income ? 1.5 : 0, (m.income / max) * plotH), h2 = Math.max(m.expense ? 1.5 : 0, (m.expense / max) * plotH);
    svg += `<g data-month="${i}">
      <rect class="bar-in${dim}" x="${cx - barW - 1}" y="${top + plotH - h1}" width="${barW}" height="${h1}" rx="3"/>
      <rect class="bar-out${dim}" x="${cx + 1}" y="${top + plotH - h2}" width="${barW}" height="${h2}" rx="3"/>
      <text class="${i === selected ? "sel-label" : ""}" x="${cx}" y="${H - 5}" text-anchor="middle">${m.label}</text>
      <rect class="hit" x="${left + group * i}" y="0" width="${group}" height="${H}"/>
    </g>`;
  });
  return svg + "</svg>";
}

function donut(slices, total) {
  if (!total) return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Sem gastos"><circle cx="21" cy="21" r="15.915" stroke="var(--track)"/><text class="center-1" x="21" y="21.5" text-anchor="middle">Sem gastos</text></svg>`;
  let offset = 25, svg = `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Gastos por categoria">`;
  slices.forEach(([, value], i) => {
    const pct = (value / total) * 100, gap = slices.length > 1 ? Math.min(0.8, pct / 2) : 0;
    svg += `<circle cx="21" cy="21" r="15.915" stroke="${CATEGORY_COLORS[i]}" stroke-dasharray="${pct - gap} ${100 - pct + gap}" stroke-dashoffset="${offset}"/>`;
    offset -= pct;
  });
  return svg + `<text class="center-1" x="21" y="19.5" text-anchor="middle">Total em R$</text><text class="center-2" x="21" y="25.5" text-anchor="middle">${esc(formatCompact(total, { currency: false }))}</text></svg>`;
}

function deltaText(now, then, versus, lowerIsBetter = false) {
  const change = then === null ? null : percentChange(now, then);
  if (change === null) return { text: then === null ? "sem comparação" : "sem dados do período anterior", short: "—", cls: "" };
  const good = lowerIsBetter ? change <= 0 : change >= 0;
  const short = `${change >= 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)}%`;
  return { text: `${short} ${versus}`, short, cls: good ? "good" : "bad" };
}

function transactionRow(t, today = todayIso(), { tagFuture = true } = {}) {
  const income = t.kind === INCOME, future = t.date > today;
  const tags = [t.recurring ? "↻ Fixa" : "", future && tagFuture ? "previsto" : ""].filter(Boolean).map((x) => ` <span class="tag">${x}</span>`).join("");
  return `<button class="item${future ? " proj" : ""}" type="button" data-edit="${t.id}">
    <span class="ico ${income ? "in" : ""}" aria-hidden="true">${income ? "$" : esc(t.category.charAt(0).toUpperCase())}</span>
    <span class="txt"><b>${esc(t.description)}</b><small>${esc(t.category)} · ${formatDate(t.date, { short: true })}${tags}</small></span>
    <span class="val ${income ? "in" : "out"}">${formatBrl(signed(t), { signed: true })}</span>
  </button>`;
}

function budgetBar(s) {
  return `<div class="budget-line" style="margin-top:12px">
    <div class="budget-top"><b>${esc(s.category)}</b>
      <small class="${s.level}">${formatBrl(s.spent, { cents: false })} de ${formatBrl(s.limit, { cents: false })} · ${Math.round(s.ratio * 100)}%</small></div>
    <div class="meter" role="meter" aria-label="${esc(s.category)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(s.ratio, 1) * 100)}"><i class="${s.level}" style="width:${Math.min(s.ratio, 1) * 100}%"></i></div></div>`;
}

function renderDashboard() {
  if (!state.transactions.length) {
    return `<section class="card empty">
      <p><b>Bem-vindo ao Titanium!</b></p>
      <p>Registre sua primeira movimentação ou veja o app funcionando com dados de exemplo.</p>
      <div class="menu"><button class="btn primary" data-action="new">Adicionar movimentação</button>
      <button class="btn" data-action="demo">Carregar dados de exemplo</button></div></section>`;
  }

  const p = period(), items = transactionsIn(state.transactions, p), s = summarize(items);
  const before = previousPeriod(p), prev = before ? summarize(transactionsIn(state.transactions, before)) : null;
  const versus = comparisonLabel(p);
  const dBal = deltaText(s.balance, prev && prev.balance, versus), dInc = deltaText(s.income, prev && prev.income, versus), dExp = deltaText(s.expense, prev && prev.expense, versus, true);

  const today = todayIso();
  const lastMonth = p.end === null ? today : (addDays(p.end, -1) < today ? addDays(p.end, -1) : today);
  const months = p.name === "Ano" || p.name === "Tudo" ? 12 : 6;
  const series = monthlySeries(state.transactions, lastMonth, months);
  const selected = ui.month !== null && ui.month < series.length ? ui.month : series.length - 1;

  const slices = topCategories(s.byCategory, 5);
  const rate = s.savingsRate;
  const budgets = budgetStatuses(state.budgets, monthItems()).slice(0, 4);
  const recent = sortRecent(items).slice(0, 4);

  return `
    <section class="card">
      <div class="label">Saldo do período</div>
      <div class="big ${s.balance < 0 ? "neg" : ""}">${formatBrl(s.balance)}</div>
      <div class="delta ${dBal.cls}">${esc(dBal.text)}</div>
    </section>
    <div class="grid2">
      <section class="card"><div class="kpi-top"><span class="badge in" aria-hidden="true">↑</span><span class="label">Receitas</span></div>
        <div class="mid">${formatBrl(s.income)}</div><div class="delta ${dInc.cls}">${esc(dInc.short)}</div></section>
      <section class="card"><div class="kpi-top"><span class="badge out" aria-hidden="true">↓</span><span class="label">Despesas</span></div>
        <div class="mid">${formatBrl(s.expense)}</div><div class="delta ${dExp.cls}">${esc(dExp.short)}</div></section>
    </div>
    <div class="gap"></div>
    <section class="card">
      <div class="label">Taxa de economia</div>
      <div class="mid ${rate !== null && rate < 0 ? "neg" : ""}">${rate === null ? "—" : Math.round(rate * 100) + "%"}</div>
      <div class="delta">${rate === null ? "sem receitas no período" : rate >= 0 ? "da renda guardada" : "gastou mais do que ganhou"}</div>
      <div class="meter" aria-hidden="true"><i style="width:${rate === null ? 0 : Math.max(0, Math.min(rate, 1)) * 100}%"></i></div>
    </section>
    ${nextMonthCard()}
    <section class="card">
      <div class="card-head"><div><h2>Receitas x despesas</h2><p class="sub">Últimos ${months} meses · toque numa barra</p></div></div>
      ${flowChart(series, selected)}
      <p class="chart-caption" id="caption">${caption(series[selected])}</p>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>Gastos por categoria</h2><p class="sub">${esc(describePeriod(p))}</p></div></div>
      ${slices.length ? `<div class="donut-wrap">${donut(slices, s.expense)}<ul class="legend">${slices.map(([name, value], i) =>
        `<li><i style="background:${CATEGORY_COLORS[i]}"></i><span>${esc(name)}</span><b>${Math.round((value / s.expense) * 100)}%</b></li>`).join("")}</ul></div>`
        : `<p class="empty">Nenhuma despesa neste período.</p>`}
    </section>
    <section class="card">
      <div class="card-head"><h2>Movimentações recentes</h2><button class="link" data-page="Movimentações">Ver todas →</button></div>
      ${recent.length ? `<div class="list">${recent.map((t) => transactionRow(t)).join("")}</div>` : `<p class="empty">Nenhuma movimentação neste período.</p>`}
    </section>
    <section class="card">
      <div class="card-head"><h2>Orçamentos do mês</h2><button class="link" data-page="Orçamentos">Editar</button></div>
      ${budgets.length ? budgets.map(budgetBar).join("") : `<p class="empty">Defina limites mensais por categoria para acompanhar seus gastos.</p>`}
    </section>`;
}

/** Previsão do mês que vem, só se houver lançamentos fixos cadastrados. */
function nextMonthCard() {
  if (!state.transactions.some((t) => t.recurring)) return "";
  const next = addMonths(monthStart(todayIso()), 1), o = monthOverview(state.transactions, next);
  return `<section class="card">
    <div class="card-head"><div><h2>Próximo mês · ${esc(describeMonth(next).split(" de ")[0])}</h2><p class="sub">Previsão com seus lançamentos fixos</p></div>
      <button class="link" type="button" data-msel="${next}">Detalhar →</button></div>
    <div class="trio">
      <div><span class="label">Receitas</span><b class="in">${formatBrl(o.income, { cents: false })}</b></div>
      <div><span class="label">Despesas</span><b class="out">${formatBrl(o.expense, { cents: false })}</b></div>
      <div><span class="label">Saldo</span><b class="${o.balance < 0 ? "out" : ""}">${formatBrl(o.balance, { cents: false })}</b></div>
    </div></section>`;
}

function caption(m) {
  if (!m) return "";
  return `<b>${m.label}</b> · <span class="in">Receitas ${formatBrl(m.income, { cents: false })}</span> · <span class="out">Despesas ${formatBrl(m.expense, { cents: false })}</span>`;
}

// ------------------------------------------------------------- movimentações

function renderTransactions() {
  const cats = allCategories();
  if (ui.category && !cats.includes(ui.category)) ui.category = "";
  return `
    <div class="filters">
      <input id="search" type="search" placeholder="Buscar descrição ou categoria…" value="${esc(ui.text)}" autocomplete="off" aria-label="Buscar">
      <div class="seg" id="kinds" role="group" aria-label="Tipo">${KIND_FILTERS.map(([label]) => `<button type="button" data-kind="${label}" aria-pressed="${ui.kind === label}">${label}</button>`).join("")}</div>
      <select id="cat-filter" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        ${cats.map((c) => `<option ${c === ui.category ? "selected" : ""}>${esc(c)}</option>`).join("")}
      </select>
    </div>
    <div id="list"></div>
    <p class="summary-line" id="summary"></p>`;
}

function dayLabel(iso, today) {
  if (iso === today) return "Hoje";
  if (iso === addDays(today, -1)) return "Ontem";
  return formatDate(iso);
}

function updateList() {
  const kind = KIND_FILTERS.find(([label]) => label === ui.kind)[1];
  const rows = sortRecent(filterTransactions(transactionsIn(state.transactions, period()), { kind, category: ui.category || null, text: ui.text }));
  const today = todayIso();
  let html = "", last = "";
  for (const t of rows) {
    if (t.date !== last) { html += `${last ? "</div>" : ""}<div class="day">${dayLabel(t.date, today)}</div><div class="list">`; last = t.date; }
    html += transactionRow(t);
  }
  const filtered = ui.text.trim() || ui.kind !== "Todos" || ui.category;
  $("#list").innerHTML = rows.length ? html + "</div>" : `<section class="card empty"><p>${filtered ? "Nada encontrado com esses filtros." : "Nenhuma movimentação neste período."}</p>${filtered ? "" : `<button class="btn primary" data-action="new">Adicionar movimentação</button>`}</section>`;
  const s = summarize(rows);
  $("#summary").innerHTML = rows.length ? `${s.count} ${s.count === 1 ? "movimentação" : "movimentações"} · Saldo ${formatBrl(s.balance)}<br>Receitas ${formatBrl(s.income)} · Despesas ${formatBrl(s.expense)}` : "";
}

// ------------------------------------------------------------------ mês a mês

function renderMonths() {
  const today = todayIso(), current = monthStart(today), months = upcomingMonths(today, 1, 12);
  if (!months.includes(ui.monthSel)) ui.monthSel = current;
  const m = ui.monthSel, o = monthOverview(state.transactions, m, today);
  const status = { futuro: "Previsto", atual: "Em andamento", passado: "Encerrado" }[o.status];

  const strip = months.map((iso) => {
    const newYear = iso.slice(5, 7) === "01" && iso !== months[0];
    return `<button type="button" class="mchip${iso === current ? " now" : ""}${newYear ? " year" : ""}" data-msel="${iso}" aria-pressed="${iso === m}" aria-label="${esc(describeMonth(iso))}">${monthLabel(iso, today)}</button>`;
  }).join("");

  const fixedExpenses = o.items.filter((t) => t.kind === EXPENSE && t.recurring);
  const oneOffExpenses = o.items.filter((t) => t.kind === EXPENSE && !t.recurring);
  const incomes = o.items.filter((t) => t.kind === INCOME);
  const group = (title, total, rows, cls) => rows.length
    ? `<section class="card"><div class="card-head"><h2>${title}</h2><b class="${cls}">${formatBrl(total)}</b></div><div class="list">${rows.map((t) => transactionRow(t, today, { tagFuture: o.status !== "futuro" })).join("")}</div></section>` : "";
  const incomeTotal = o.income;
  const level = o.commitment === null ? "" : o.commitment > 1 ? "estourado" : o.commitment >= 0.7 ? "alerta" : "";

  return `
    <div class="month-strip" id="strip" role="group" aria-label="Escolha o mês">${strip}</div>
    <section class="card">
      <div class="card-head"><div><h2>${esc(describeMonth(m))}</h2><p class="sub">${o.status === "futuro" ? "Só o que já está cadastrado" : o.status === "atual" ? "Realizado e previsto até o fim do mês" : "Tudo o que caiu no mês"}</p></div><span class="pill ${o.status}">${status}</span></div>
      <div class="trio">
        <div><span class="label">Receitas</span><b class="in">${formatBrl(o.income, { cents: false })}</b></div>
        <div><span class="label">Despesas</span><b class="out">${formatBrl(o.expense, { cents: false })}</b></div>
        <div><span class="label">Saldo</span><b class="${o.balance < 0 ? "out" : ""}">${formatBrl(o.balance, { cents: false })}</b></div>
      </div>
      ${o.commitment === null ? "" : `<p class="commit">Despesas fixas: <b>${formatBrl(o.fixedExpense, { cents: false })}</b> · ${Math.round(o.commitment * 100)}% da receita do mês</p>
        <div class="meter" aria-hidden="true"><i class="${level}" style="width:${Math.min(o.commitment, 1) * 100}%"></i></div>`}
    </section>
    ${group("Despesas fixas", o.fixedExpense, fixedExpenses, "out")}
    ${group("Despesas avulsas", o.oneOffExpense, oneOffExpenses, "out")}
    ${group("Receitas", incomeTotal, incomes, "in")}
    ${o.items.length ? "" : `<section class="card empty"><p>Nada lançado em ${esc(describeMonth(m).toLowerCase())}.</p><p class="hint">Cadastre uma despesa ou receita como <b>Fixo todo mês</b> e ela já aparece em todos os meses seguintes.</p></section>`}
    <div class="menu"><button class="btn primary" type="button" data-action="new">+ Lançar em ${esc(monthName(m))}</button></div>`;
}

function centerSelectedMonth() {
  const strip = $("#strip"), selected = strip?.querySelector('[aria-pressed="true"]');
  if (strip && selected) strip.scrollLeft = selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2;
}

// --------------------------------------------------------------- orçamentos

function renderBudgets() {
  const month = monthItems(), spent = new Map(summarize(month).byCategory);
  const statuses = new Map(budgetStatuses(state.budgets, month).map((s) => [s.category, s]));
  const expenseCats = new Set(state.transactions.filter((t) => t.kind === EXPENSE).map((t) => t.category));
  const names = [...new Set([...CATEGORIES.filter((c) => c !== "Trabalho"), ...expenseCats, ...Object.keys(state.budgets)])]
    .sort((a, b) => (spent.get(b) ?? 0) - (spent.get(a) ?? 0) || a.localeCompare(b, "pt-BR"));
  const totalLimit = Object.values(state.budgets).reduce((a, b) => a + b, 0);
  const totalSpent = Object.keys(state.budgets).reduce((a, c) => a + (spent.get(c) ?? 0), 0);

  return `
    <section class="card">
      <b>${Object.keys(state.budgets).length ? `${formatBrl(totalSpent)} gastos de ${formatBrl(totalLimit)} planejados em ${monthName(todayIso())}` : "Nenhum orçamento definido ainda"}</b>
      <p class="hint">Digite um limite mensal e confirme. Deixe em branco para remover. Fica amarelo a partir de 90% e vermelho quando passa do limite.</p>
    </section>
    ${names.map((name) => {
      const s = statuses.get(name);
      const detail = s ? (s.level === "estourado" ? `Passou ${formatBrl(-s.remaining)} do limite` : `Restam ${formatBrl(s.remaining)} · ${Math.round(s.ratio * 100)}% usado`) : `Gasto no mês: ${formatBrl(spent.get(name) ?? 0)}`;
      return `<section class="card budget">
        <div class="budget-top"><div><b>${esc(name)}</b><small class="${s ? s.level : ""}">${detail}</small></div>
          <label class="money-input">R$ <input type="text" inputmode="decimal" placeholder="Sem limite" data-budget="${esc(name)}" value="${s ? s.limit.toFixed(2).replace(".", ",") : ""}" aria-label="Limite mensal de ${esc(name)}" enterkeyhint="done"></label></div>
        <div class="meter" aria-hidden="true"><i class="${s ? s.level : ""}" style="width:${s ? Math.min(s.ratio, 1) * 100 : 0}%"></i></div>
      </section>`;
    }).join("")}`;
}

function saveBudget(input) {
  const category = input.dataset.budget, text = input.value.trim(), current = state.budgets[category];
  let value = null;
  if (text) {
    try { value = parseAmount(text); } catch (e) { if (e instanceof ValidationError) { toast(`${category}: ${e.message}`); return; } throw e; }
  }
  if (value === (current ?? null)) return;
  if (value === null) delete state.budgets[category]; else state.budgets[category] = value;
  persist();
  toast(`Orçamento de ${category} ${value === null ? "removido" : "salvo"}.`);
  render({ keepScroll: true });
}

// --------------------------------------------------------------------- mais

function renderMore() {
  const iosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  return `
    <section class="card"><h2>Aparência</h2>
      <div class="seg" style="margin-top:10px" role="group" aria-label="Tema">${THEMES.map(([value, label]) => `<button type="button" data-theme="${value}" aria-pressed="${state.settings.theme === value}">${label}</button>`).join("")}</div>
    </section>
    <section class="card"><h2>Seus dados</h2>
      <div class="menu" style="margin-top:10px">
        <button class="btn" data-action="export-csv">Exportar planilha (CSV)</button>
        <button class="btn" data-action="export-json">Salvar backup (JSON)</button>
        <button class="btn" data-action="import">Importar CSV ou backup</button>
      </div>
      <p class="hint">O CSV é o mesmo do app de computador: dá para levar seus lançamentos de um para o outro.</p>
    </section>
    <section class="card"><h2>Instalar no celular</h2>
      ${installed ? `<p class="hint">O Titanium já está instalado neste aparelho. ✓</p>`
        : ui.installEvent ? `<div class="menu" style="margin-top:10px"><button class="btn primary" data-action="install">Instalar app</button></div>`
        : iosHint ? `<p class="hint">No iPhone: toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</p>`
        : `<p class="hint">No Chrome: menu ⋮ → <b>Instalar app</b>. O Titanium funciona offline depois de aberto uma vez.</p>`}
    </section>
    <section class="card"><h2>Zona de cuidado</h2>
      <div class="menu" style="margin-top:10px">
        <button class="btn" data-action="demo">Carregar dados de exemplo</button>
        <button class="btn danger" data-action="wipe">Apagar todos os dados</button>
      </div>
    </section>
    <p class="about">Titanium Finance v${VERSION}<br>${DEMO ? "Modo demonstração: nada é salvo." : `${state.transactions.length} movimentações · tudo guardado só neste aparelho.`}</p>`;
}

async function shareOrDownload(filename, text, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${filename} salvo.`);
}

const keyOf = (t) => [t.date, t.description.toLocaleLowerCase("pt-BR"), t.amount, t.kind, t.category.toLocaleLowerCase("pt-BR"), t.recurring ? "fixo" : ""].join("|");

function mergeImported(items) {
  const known = new Set(state.transactions.map(keyOf));
  const fresh = items.filter((t) => !known.has(keyOf(t)) && known.add(keyOf(t)));
  addTransactions(fresh);
  return fresh.length;
}

async function importFile(file) {
  const text = await file.text();
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.transactions)) throw new Error("formato");
      const valid = [];
      for (const raw of data.transactions) {
        try { valid.push(makeTransaction({ description: raw.description, amount: raw.amount, kind: raw.kind, category: raw.category, when: raw.date, recurring: raw.recurring === true, until: raw.until ?? "" })); } catch { /* ignora a linha */ }
      }
      const added = mergeImported(valid);
      for (const [c, v] of Object.entries(data.budgets ?? {})) if (typeof v === "number" && v > 0) state.budgets[c] = v;
      toast(`${added} movimentações importadas${valid.length - added ? ` (${valid.length - added} já existiam)` : ""}.`);
    } else {
      const { items, skipped } = importCsv(text);
      const added = mergeImported(items);
      toast(`${added} movimentações importadas${items.length - added ? `, ${items.length - added} já existiam` : ""}${skipped ? `, ${skipped} linhas ignoradas` : ""}.`);
    }
    persist();
    render();
  } catch {
    toast("Não consegui ler esse arquivo. Use um CSV ou backup do Titanium.");
  }
}

function backupJson() {
  return JSON.stringify({
    app: "titanium", version: 1, exportedAt: new Date().toISOString(),
    transactions: state.transactions.map(({ id, ...rest }) => rest), budgets: state.budgets,
  }, null, 2);
}

// ----------------------------------------------------------------- lançamento

const sheet = $("#sheet"), form = $("#sheet-form");
let editing = null;

function fillCategories(selected) {
  const cats = allCategories();
  if (selected && !cats.includes(selected)) cats.push(selected);
  $("#f-category").innerHTML = cats.map((c) => `<option ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("") + `<option value="__new__">＋ Nova categoria…</option>`;
  $("#f-new-wrap").hidden = true;
}

/** Data dentro do mês escolhido: hoje, se for o mês atual; senão o mesmo dia de hoje (ou o último dia do mês). */
function dateInMonth(monthIso) {
  const today = todayIso();
  if (monthStart(today) === monthIso) return today;
  const last = Number(addDays(addMonths(monthIso, 1), -1).slice(8));
  return `${monthIso.slice(0, 8)}${String(Math.min(Number(today.slice(8)), last)).padStart(2, "0")}`;
}

/** Explica ao usuário o que "Só este mês" e "Fixo todo mês" significam para a data escolhida. */
function syncFrequency() {
  const monthly = form.elements.freq.value === "monthly";
  const date = $("#f-date").value || todayIso();
  $("#f-until-wrap").hidden = !monthly;
  $("#f-date-label").textContent = monthly ? "Começa em" : "Data";
  const until = $("#f-until").value;
  $("#freq-hint").textContent = monthly
    ? `Repete todo mês no dia ${Number(date.slice(8))}, a partir de ${describeMonth(monthStart(date)).toLowerCase()}${until ? ` até ${describeMonth(`${until}-01`).toLowerCase()}` : ", até você encerrar"}.${editing ? " Mudanças valem para todos os meses." : ""}`
    : `Vale só para ${describeMonth(monthStart(date)).toLowerCase()}.`;
}

function openSheet(id = null, { month = null } = {}) {
  editing = id === null ? null : state.transactions.find((t) => t.id === id) ?? null;
  const kind = editing ? editing.kind : state.settings.lastKind;
  $("#sheet-title").textContent = editing ? (editing.recurring ? "Editar lançamento fixo" : "Editar movimentação") : "Nova movimentação";
  form.elements.kind.value = kind;
  form.elements.freq.value = editing?.recurring ? "monthly" : "once";
  $("#f-until").value = editing?.until ?? "";
  $("#f-description").value = editing ? editing.description : "";
  $("#f-amount").value = editing ? editing.amount.toFixed(2).replace(".", ",") : "";
  $("#f-date").value = editing ? editing.date : month ? dateInMonth(month) : todayIso();
  syncFrequency();
  fillCategories(editing ? editing.category : kind === state.settings.lastKind ? state.settings.lastCategory : DEFAULT_CATEGORY[kind]);
  $("#f-new").value = "";
  $("#sheet-error").textContent = "";
  $("#f-delete").hidden = !editing;
  sheet.showModal();
  if (!editing) $("#f-description").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const category = $("#f-category").value === "__new__" ? $("#f-new").value : $("#f-category").value;
  try {
    const t = makeTransaction({
      description: $("#f-description").value, amount: $("#f-amount").value, kind: form.elements.kind.value,
      category, when: $("#f-date").value, recurring: form.elements.freq.value === "monthly", until: $("#f-until").value,
    });
    const wasEditing = Boolean(editing);
    if (editing) Object.assign(editing, t); else addTransactions([t]);
    state.settings.lastKind = t.kind;
    state.settings.lastCategory = t.category;
    persist();
    sheet.close();
    toast(wasEditing ? "Movimentação atualizada." : `Adicionada${t.recurring ? " (fixa todo mês)" : ""}: ${formatBrl(signed(t), { signed: true })}.`);
    render({ keepScroll: true });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    $("#sheet-error").textContent = error.message;
  }
});

// Ao trocar Despesa/Receita num lançamento ainda em branco, a categoria padrão acompanha.
form.querySelectorAll('input[name="kind"]').forEach((radio) => radio.addEventListener("change", () => {
  if (!editing && !$("#f-description").value) fillCategories(DEFAULT_CATEGORY[form.elements.kind.value]);
}));

form.querySelectorAll('input[name="freq"]').forEach((radio) => radio.addEventListener("change", syncFrequency));
$("#f-date").addEventListener("change", syncFrequency);
$("#f-until").addEventListener("change", syncFrequency);

$("#f-category").addEventListener("change", (e) => {
  $("#f-new-wrap").hidden = e.target.value !== "__new__";
  if (e.target.value === "__new__") $("#f-new").focus();
});

// Repete tipo e categoria da última vez que essa descrição foi usada.
$("#f-description").addEventListener("blur", () => {
  if (editing) return;
  const typed = $("#f-description").value.trim().toLocaleLowerCase("pt-BR");
  const match = typed && sortRecent(state.transactions).find((t) => t.description.toLocaleLowerCase("pt-BR") === typed);
  if (match) { form.elements.kind.value = match.kind; fillCategories(match.category); }
});

$("#f-cancel").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
$("#f-delete").addEventListener("click", () => {
  const what = editing?.recurring ? `Excluir o lançamento fixo “${editing.description}” (${formatBrl(signed(editing), { signed: true })} todo mês)?\n\nEle some de todos os meses, inclusive dos passados.`
    : editing ? `Excluir “${editing.description}” (${formatBrl(signed(editing), { signed: true })}, ${formatDate(editing.date)})?\n\nEssa ação não pode ser desfeita.` : "";
  if (!editing || !confirm(what)) return;
  state.transactions = state.transactions.filter((t) => t.id !== editing.id);
  persist();
  sheet.close();
  toast("Movimentação excluída.");
  render({ keepScroll: true });
});
document.querySelectorAll("[data-date]").forEach((chip) => chip.addEventListener("click", () => {
  $("#f-date").value = addDays(todayIso(), -Number(chip.dataset.date));
}));

// ---------------------------------------------------------------- navegação

function render({ keepScroll = false } = {}) {
  const y = window.scrollY;
  $("#title").textContent = TITLES[ui.page];
  const today = todayIso();
  $("#subtitle").textContent = {
    Painel: `${describePeriod(period())} · seus números em um só lugar`,
    Meses: "Despesas e receitas, mês a mês",
    Movimentações: `${describePeriod(period())} · toque para editar`,
    Orçamentos: `Limites mensais · ${monthName(today)} de ${today.slice(0, 4)}`,
    Mais: "Ajustes, dados e instalação",
  }[ui.page];

  const showPeriod = ui.page === "Painel" || ui.page === "Movimentações";
  const seg = $("#period");
  seg.hidden = !showPeriod;
  seg.innerHTML = PERIODS.map((p) => `<button type="button" data-period="${p}" aria-pressed="${state.settings.period === p}">${p}</button>`).join("");

  $("#view").innerHTML = { Painel: renderDashboard, Meses: renderMonths, Movimentações: renderTransactions, Orçamentos: renderBudgets, Mais: renderMore }[ui.page]();
  if (ui.page === "Movimentações") updateList();
  if (ui.page === "Meses") centerSelectedMonth();
  document.querySelectorAll("#tabs button").forEach((b) => {
    if (b.dataset.page === ui.page) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $("#fab").hidden = ui.page === "Mais";
  window.scrollTo(0, keepScroll ? y : 0);
}

/** Na aba "Meses", o novo lançamento já nasce dentro do mês que está aberto. */
function newTransaction() {
  openSheet(null, ui.page === "Meses" ? { month: ui.monthSel } : {});
}

function go(page) {
  ui.page = page;
  render();
}

document.addEventListener("click", async (event) => {
  const el = event.target.closest("button, [data-month], [data-edit]");
  if (!el) return;
  const d = el.dataset;
  if (d.msel) { ui.monthSel = d.msel; return ui.page === "Meses" ? render({ keepScroll: true }) : go("Meses"); }
  if (d.page) return go(d.page);
  if (d.period) { state.settings.period = d.period; persist(); return render({ keepScroll: true }); }
  if (d.edit) return openSheet(Number(d.edit));
  if (d.kind) { ui.kind = d.kind; $("#kinds").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.kind === ui.kind)); return updateList(); }
  if (d.theme) { state.settings.theme = d.theme; persist(); applyTheme(); return render({ keepScroll: true }); }
  switch (d.action) {
    case "new": return newTransaction();
    case "demo":
      if (state.transactions.length && !confirm("Adicionar dados de exemplo aos que você já tem?")) return;
      addTransactions(demoTransactions());
      if (!Object.keys(state.budgets).length) state.budgets = { ...DEMO_BUDGETS };
      persist(); toast("Dados de exemplo carregados."); return render();
    case "wipe":
      if (!confirm("Apagar TODAS as movimentações e orçamentos deste aparelho?\n\nEssa ação não pode ser desfeita. Considere salvar um backup antes.")) return;
      state.transactions = []; state.budgets = {}; state.nextId = 1; persist(); toast("Dados apagados."); return render();
    case "export-csv":
      if (!state.transactions.length) return toast("Não há movimentações para exportar.");
      return shareOrDownload(`titanium-${todayIso()}.csv`, exportCsv(sortRecent(state.transactions)), "text/csv");
    case "export-json": return shareOrDownload(`titanium-backup-${todayIso()}.json`, backupJson(), "application/json");
    case "import": return $("#file").click();
    case "install": {
      const prompt = ui.installEvent; ui.installEvent = null;
      await prompt.prompt(); return render({ keepScroll: true });
    }
  }
});

// Toque numa barra do gráfico mostra os valores daquele mês sem recarregar a tela.
document.addEventListener("click", (event) => {
  const g = event.target.closest("g[data-month]");
  if (!g) return;
  ui.month = Number(g.dataset.month);
  render({ keepScroll: true });
});

document.addEventListener("input", (event) => {
  if (event.target.id === "search") { ui.text = event.target.value; updateList(); }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "cat-filter") { ui.category = event.target.value; updateList(); }
  if (event.target.dataset?.budget !== undefined) saveBudget(event.target);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.dataset?.budget !== undefined) event.target.blur();
});
$("#fab").addEventListener("click", () => newTransaction());
$("#tabs").addEventListener("click", (event) => { const b = event.target.closest("button"); if (b) go(b.dataset.page); });
$("#file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file) await importFile(file);
});

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); ui.installEvent = event; if (ui.page === "Mais") render({ keepScroll: true }); });
window.addEventListener("appinstalled", () => { ui.installEvent = null; toast("Titanium instalado!"); });
// Ao voltar para o app depois de dias, o "hoje" e o mês atual precisam ser recalculados.
document.addEventListener("visibilitychange", () => { if (!document.hidden && !sheet.open) render({ keepScroll: true }); });

applyTheme();
render();
if (DEMO && params.has("sheet")) {
  newTransaction();
  if (params.has("fixo")) {
    form.elements.freq.value = "monthly";
    $("#f-description").value = "Academia";
    $("#f-amount").value = "119,90";
    $("#f-category").value = "Saúde";
    $("#f-until").value = "2027-06";
    syncFrequency();
  }
  sheet.style.animation = "none";
}
if (DEMO && params.has("scroll")) window.scrollTo(0, Number(params.get("scroll")) || 0);
if (!DEMO) navigator.storage?.persist?.();

if ("serviceWorker" in navigator && !DEMO) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) toast("App atualizado. Feche e abra de novo para ver as novidades."); });
}
