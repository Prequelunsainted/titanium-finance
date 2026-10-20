// Interface do Titanium Finance (celular).
// Regras financeiras: core.js · armazenamento: store.js · folhas auxiliares: panels.js ·
// bloqueio: lock.js / security.js · gráficos: charts.js. Veja CLAUDE.md para o mapa completo.

import {
  CATEGORIES, DEFAULT_CATEGORY, DEFAULT_TYPES, DEMO_BUDGETS, DEMO_CARDS, EXPENSE, FINANCING_SYSTEMS, INCOME, PERIODS,
  ValidationError, addDays, addMonths, budgetStatuses, cardUsage, comparisonLabel, dailyBalances, daysBetween,
  demoTransactions, describeMonth, describePeriod, expandRange, exportCsv, filterTransactions, financingSummary,
  formatBrl, formatCompact, formatDate, importCsv, makeFinancing, makeTransaction, monthLabel, monthName, monthOverview, monthlySeries,
  monthStart, parseAmount, parseBankText, percentChange, periodRange, previousPeriod, round2, signed, sortRecent,
  summarize, todayIso, topCategories, transactionsIn, upcomingMonths,
} from "./core.js";
import { backupData, clearAll, defaults, load, save } from "./store.js";
import { $, esc, initialOf } from "./util.js";
import { CATEGORY_COLORS, donut, flowChart } from "./charts.js";
import { badge, categoryMeta, icon, typeMeta } from "./icons.js";
import { createPanels } from "./panels.js";
import { createLock } from "./lock.js";

const VERSION = "2.3.1";
const PAGES = ["Painel", "Meses", "Movimentações", "Orçamentos", "Mais"];
const TITLES = { Painel: "Visão geral", Meses: "Mês a mês", Movimentações: "Lançamentos", Orçamentos: "Orçamentos", Financiamentos: "Financiamentos", Mais: "Configurações" };
const THEMES = [["system", "Sistema"], ["light", "Claro"], ["dark", "Escuro"]];
const KIND_FILTERS = [["Todos", null], ["Receitas", INCOME], ["Despesas", EXPENSE]];

// ?demo abre o app com dados de exemplo só na memória (nada é salvo): bom para conhecer ou tirar prints.
// Extras: &page=Meses|Financiamentos &month=2026-11-01 &theme=dark|light &scroll=700 &nome=Lucas
//         &sheet[&fixo] &panel=perfil|seguranca|cartoes|tipos|personalizar|financiamento &dash=cartao &lock
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

let state = load();
const ui = {
  page: "Painel", kind: "Todos", category: "", type: "", text: "", month: null, monthSel: null, mfilter: "all",
  locked: false, skipRelockUntil: 0, warnedStorage: false, installEvent: null,
};
let panels, lock;

if (DEMO) {
  state = defaults();
  addTransactions(demoTransactions());
  state.budgets = { ...DEMO_BUDGETS };
  state.cards = DEMO_CARDS.map((c) => ({ ...c }));
  state.profile.name = params.get("nome") ?? "";
  state.settings.theme = ["light", "dark"].includes(params.get("theme")) ? params.get("theme") : "system";
  if ([...PAGES, "Financiamentos"].includes(params.get("page"))) ui.page = params.get("page");
  if (/^\d{4}-\d{2}-01$/.test(params.get("month") ?? "")) ui.monthSel = params.get("month");
  if (params.get("dash") === "cartao") state.settings.dashboard.visible = { saldo: true, cartoes: true, resumo: false, economia: false, proximo: false, financiamentos: false, fluxo: false, categorias: false, recentes: false, orcamentos: false };
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
const allTypes = () => [...new Set([...DEFAULT_TYPES, ...state.types, ...state.cards.map((c) => c.name), ...state.transactions.map((t) => t.type).filter(Boolean)])];
const subcategoriesOf = (category) => [...new Set(state.transactions.filter((t) => t.category === category && t.subcategory).map((t) => t.subcategory))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const sameText = (a, b) => a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");

function addTransactions(items) {
  for (const t of items) state.transactions.push({ id: state.nextId++, ...t });
}

let toastTimer;
function toast(message, action = null) {
  const el = $("#toast");
  el.innerHTML = `${esc(message)}${action ? ` <button type="button" class="toast-action">${esc(action.label)}</button>` : ""}`;
  el.classList.toggle("has-action", Boolean(action));
  el.classList.add("show");
  el.querySelector(".toast-action")?.addEventListener("click", () => { clearTimeout(toastTimer); el.classList.remove("show"); action.run(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), action ? 8000 : 3600);
}

/** Aplica uma mudança e oferece "Desfazer" por alguns segundos (nada se perde por um toque errado). */
function withUndo(mutate, message) {
  const snapshot = JSON.stringify({ transactions: state.transactions, nextId: state.nextId, budgets: state.budgets, cards: state.cards, types: state.types });
  mutate();
  persist();
  toast(message, { label: "Desfazer", run: () => { Object.assign(state, JSON.parse(snapshot)); persist(); toast("Desfeito."); render({ keepScroll: true }); } });
  render({ keepScroll: true });
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
// O painel é uma lista de blocos (widgets). O usuário escolhe quais ver e em que ordem; blocos novos
// que surgirem em versões futuras entram sozinhos no lugar padrão, e "Restaurar padrão" volta ao original.

const WIDGETS = [
  { id: "saldo", title: "Saldo do período", render: wSaldo },
  { id: "resumo", title: "Receitas e despesas", render: wResumo },
  { id: "economia", title: "Taxa de economia", render: wEconomia },
  { id: "cartoes", title: "Limite do cartão", render: wCartoes, auto: () => state.cards.length > 0 },
  { id: "proximo", title: "Previsão do próximo mês", render: wProximo, auto: () => state.transactions.some((t) => t.recurring || t.plan) },
  { id: "financiamentos", title: "Financiamentos", render: wFinanciamentos, auto: () => state.transactions.some((t) => t.plan) },
  { id: "fluxo", title: "Gráfico de receitas x despesas", render: wFluxo },
  { id: "categorias", title: "Gastos por categoria", render: wCategorias },
  { id: "recentes", title: "Movimentações recentes", render: wRecentes },
  { id: "orcamentos", title: "Orçamentos do mês", render: wOrcamentos },
];

const widgetVisible = (w) => state.settings.dashboard.visible[w.id] ?? (w.auto ? w.auto() : true);

function dashboardLayout() {
  const known = new Map(WIDGETS.map((w) => [w.id, w]));
  const result = state.settings.dashboard.order.filter((id) => known.has(id));
  WIDGETS.forEach((w, i) => {
    if (result.includes(w.id)) return;
    const before = WIDGETS.slice(0, i).map((x) => x.id).reverse().find((id) => result.includes(id));
    result.splice(before ? result.indexOf(before) + 1 : 0, 0, w.id);
  });
  return result.map((id) => known.get(id));
}

const widgetList = () => dashboardLayout().map((w) => ({ id: w.id, title: w.title, visible: widgetVisible(w) }));

function moveWidget(id, step) {
  const order = dashboardLayout().map((w) => w.id), i = order.indexOf(id), j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  state.settings.dashboard.order = order;
  persist();
}

function toggleWidget(id, on) { state.settings.dashboard.visible[id] = on; persist(); }
function resetDashboard() { state.settings.dashboard = { order: [], visible: {} }; persist(); }

function deltaText(now, then, versus, lowerIsBetter = false) {
  const change = then === null ? null : percentChange(now, then);
  if (change === null) return { text: then === null ? "sem comparação" : "sem dados do período anterior", short: "—", cls: "" };
  const good = lowerIsBetter ? change <= 0 : change >= 0;
  const short = `${change >= 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)}%`;
  return { text: `${short} ${versus}`, short, cls: good ? "good" : "bad" };
}

const cardNames = () => state.cards.map((c) => c.name);
const CHEV = icon("chevronRight", "i chev");

/** Avatar do perfil: a foto, a inicial do nome ou o ícone de pessoa. */
function avatarInner() {
  const p = state.profile, letter = initialOf(p.name);
  return p.photo ? `<img src="${p.photo}" alt="">` : letter ? esc(letter) : icon("user");
}

function typeChip(type) {
  const m = typeMeta(type, cardNames());
  return `<span class="mtype" style="--ic:${m.color}">${icon(m.icon)}${esc(type)}</span>`;
}

function transactionRow(t, today = todayIso(), { tagFuture = true, showDate = true } = {}) {
  const income = t.kind === INCOME, future = t.date > today;
  const tags = [t.recurring ? `${icon("repeat")}Fixa` : "", t.plan ? `Parcela ${t.installment}/${t.installments}` : "", future && tagFuture ? "previsto" : ""]
    .filter(Boolean).map((x) => ` <span class="tag">${x}</span>`).join("");
  const category = `${t.category}${t.subcategory ? ` › ${t.subcategory}` : ""}`;
  return `<button class="item${future ? " proj" : ""}" type="button" data-edit="${t.id}">
    ${badge(categoryMeta(t.category), "ico")}
    <span class="txt"><b>${esc(t.description)}</b><small>${esc(category)}${showDate ? ` · ${formatDate(t.date, { short: true })}` : ""}${t.type ? ` · ${typeChip(t.type)}` : ""}${tags}</small></span>
    <span class="val ${income ? "in" : "out"}">${formatBrl(signed(t), { signed: true })}</span>
  </button>`;
}

function budgetBar(s) {
  return `<div class="budget-line" style="margin-top:12px">
    <div class="budget-top"><span class="bname">${badge(categoryMeta(s.category), "ibadge sm")}<b>${esc(s.category)}</b></span>
      <small class="${s.level}">${formatBrl(s.spent, { cents: false })} de ${formatBrl(s.limit, { cents: false })} · ${Math.round(s.ratio * 100)}%</small></div>
    <div class="meter" role="meter" aria-label="${esc(s.category)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(s.ratio, 1) * 100)}"><i class="${s.level}" style="width:${Math.min(s.ratio, 1) * 100}%"></i></div></div>`;
}

/** Saldo acumulado até hoje (saldo inicial + tudo que já aconteceu). */
function balanceToday(today) {
  const days = dailyBalances(expandRange(state.transactions, null, null, today), state.settings.openingBalance);
  return days.length ? days.at(-1).after : state.settings.openingBalance;
}

function wSaldo(c) {
  return `<section class="card">
    <div class="label">Saldo do período</div>
    <div class="big ${c.s.balance < 0 ? "neg" : ""}">${formatBrl(c.s.balance)}</div>
    <div class="delta ${c.dBal.cls}">${esc(c.dBal.text)}</div>
    <p class="delta">Saldo acumulado até hoje: <b>${formatBrl(balanceToday(c.today))}</b></p>
  </section>`;
}

function wResumo(c) {
  return `<div class="grid2">
    <section class="card"><div class="kpi-top">${badge({ icon: "arrowUp", color: "#34D399" }, "ibadge sm")}<span class="label">Receitas</span></div>
      <div class="mid">${formatBrl(c.s.income)}</div><div class="delta ${c.dInc.cls}">${esc(c.dInc.short)}</div></section>
    <section class="card"><div class="kpi-top">${badge({ icon: "arrowDown", color: "#F87171" }, "ibadge sm")}<span class="label">Despesas</span></div>
      <div class="mid">${formatBrl(c.s.expense)}</div><div class="delta ${c.dExp.cls}">${esc(c.dExp.short)}</div></section>
  </div>`;
}

function wEconomia(c) {
  const rate = c.s.savingsRate;
  return `<section class="card">
    <div class="label">Taxa de economia</div>
    <div class="mid ${rate !== null && rate < 0 ? "neg" : ""}">${rate === null ? "—" : Math.round(rate * 100) + "%"}</div>
    <div class="delta">${rate === null ? "sem receitas no período" : rate >= 0 ? "da renda guardada" : "gastou mais do que ganhou"}</div>
    <div class="meter" aria-hidden="true"><i style="width:${rate === null ? 0 : Math.max(0, Math.min(rate, 1)) * 100}%"></i></div>
  </section>`;
}

function wCartoes(c) {
  if (!state.cards.length) {
    return `<section class="card"><div class="card-head"><h2>Limite do cartão</h2></div><p class="empty">Cadastre seu cartão para ver o limite disponível.</p>
      <div class="menu"><button class="btn" type="button" data-action="cards">Cadastrar cartão</button></div></section>`;
  }
  return `<section class="card">
    <div class="card-head"><div><h2>Limite do cartão</h2><p class="sub">Fatura aberta</p></div><button class="link" type="button" data-action="cards">Gerenciar</button></div>
    ${state.cards.map((card) => {
      const u = cardUsage(card, state.transactions, c.today);
      return `<div class="cardu"><div class="budget-top"><b>${esc(card.name)}</b><small class="${u.level}">${formatBrl(u.available, { cents: false })} disponíveis</small></div>
        <div class="meter" role="meter" aria-label="Uso do ${esc(card.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(u.ratio, 1) * 100)}"><i class="${u.level}" style="width:${Math.min(u.ratio, 1) * 100}%"></i></div>
        <p class="hint">${formatBrl(u.used)} de ${formatBrl(u.limit, { cents: false })} · fecha ${u.daysToClosing === 0 ? "hoje" : `em ${u.daysToClosing} dia${u.daysToClosing === 1 ? "" : "s"}`}${u.due ? ` · vence ${formatDate(u.due, { short: true })}` : ""}</p></div>`;
    }).join("")}</section>`;
}

/** Previsão do mês que vem, a partir dos lançamentos fixos e das parcelas. */
function wProximo(c) {
  const next = addMonths(monthStart(c.today), 1), o = monthOverview(state.transactions, next, c.today);
  return `<section class="card">
    <div class="card-head"><div><h2>Próximo mês · ${esc(describeMonth(next).split(" de ")[0])}</h2><p class="sub">Previsão com seus fixos e parcelas</p></div>
      <button class="link" type="button" data-msel="${next}">Detalhar ${icon("chevronRight")}</button></div>
    <div class="trio">
      <div><span class="label">Receitas</span><b class="in">${formatBrl(o.income, { cents: false })}</b></div>
      <div><span class="label">Despesas</span><b class="out">${formatBrl(o.expense, { cents: false })}</b></div>
      <div><span class="label">Saldo</span><b class="${o.balance < 0 ? "out" : ""}">${formatBrl(o.balance, { cents: false })}</b></div>
    </div></section>`;
}

function wFinanciamentos(c) {
  const fins = state.transactions.filter((t) => t.plan).map((t) => ({ t, s: financingSummary(t, c.today) })).filter((x) => !x.s.done);
  return `<section class="card">
    <div class="card-head"><div><h2>Financiamentos</h2><p class="sub">${fins.length ? `${fins.length} em andamento` : "Nenhum em andamento"}</p></div><button class="link" type="button" data-page="Financiamentos">Ver todos ${icon("chevronRight")}</button></div>
    ${fins.length ? fins.slice(0, 3).map(({ t, s }) => `<div class="cardu"><div class="budget-top"><b>${esc(t.description)}</b><small>${s.paidCount}/${s.count} pagas</small></div>
      <div class="meter" aria-hidden="true"><i style="width:${s.progress * 100}%"></i></div>
      <p class="hint">${s.next ? `Próxima: ${formatBrl(s.next.payment)} em ${formatDate(s.next.date, { short: true })} · ` : ""}saldo devedor ${formatBrl(s.balance, { cents: false })}</p></div>`).join("")
      : `<p class="empty">Cadastre um financiamento ou parcelamento para acompanhar parcelas, juros e saldo devedor.</p><div class="menu"><button class="btn" type="button" data-action="new-financing">Novo financiamento</button></div>`}
  </section>`;
}

function caption(m) {
  if (!m) return "";
  return `<b>${m.label}</b> · <span class="in">Receitas ${formatBrl(m.income, { cents: false })}</span> · <span class="out">Despesas ${formatBrl(m.expense, { cents: false })}</span>`;
}

function wFluxo(c) {
  const p = c.p, lastMonth = p.end === null ? c.today : (addDays(p.end, -1) < c.today ? addDays(p.end, -1) : c.today);
  const months = p.name === "Ano" || p.name === "Tudo" ? 12 : 6;
  const series = monthlySeries(state.transactions, lastMonth, months, c.today);
  const selected = ui.month !== null && ui.month < series.length ? ui.month : series.length - 1;
  return `<section class="card">
    <div class="card-head"><div><h2>Receitas x despesas</h2><p class="sub">Últimos ${months} meses · toque numa barra</p></div></div>
    ${flowChart(series, selected)}
    <p class="chart-caption" id="caption">${caption(series[selected])}</p>
  </section>`;
}

function wCategorias(c) {
  const bySub = state.settings.categoryView === "subcategoria";
  const slices = topCategories(bySub ? c.s.bySubcategory : c.s.byCategory, 5);
  return `<section class="card">
    <div class="card-head"><div><h2>Gastos por ${bySub ? "subcategoria" : "categoria"}</h2><p class="sub">${esc(describePeriod(c.p))}</p></div>
      <div class="seg mini" role="group" aria-label="Agrupar por"><button type="button" data-catview="categoria" aria-pressed="${!bySub}">Categoria</button><button type="button" data-catview="subcategoria" aria-pressed="${bySub}">Sub</button></div></div>
    ${slices.length ? `<div class="donut-wrap">${donut(slices, c.s.expense)}<ul class="legend">${slices.map(([name, value], i) =>
      `<li><i style="background:${CATEGORY_COLORS[i]}"></i><span>${esc(name)}</span><b>${Math.round((value / c.s.expense) * 100)}%</b></li>`).join("")}</ul></div>`
      : `<p class="empty">Nenhuma despesa neste período.</p>`}
  </section>`;
}

function wRecentes(c) {
  const recent = sortRecent(c.items).slice(0, 4);
  return `<section class="card">
    <div class="card-head"><h2>Movimentações recentes</h2><button class="link" type="button" data-page="Movimentações">Ver todas ${icon("chevronRight")}</button></div>
    ${recent.length ? `<div class="list">${recent.map((t) => transactionRow(t)).join("")}</div>` : `<p class="empty">Nenhuma movimentação neste período.</p>`}
  </section>`;
}

function wOrcamentos() {
  const budgets = budgetStatuses(state.budgets, monthItems()).slice(0, 4);
  return `<section class="card">
    <div class="card-head"><h2>Orçamentos do mês</h2><button class="link" type="button" data-page="Orçamentos">Editar</button></div>
    ${budgets.length ? budgets.map(budgetBar).join("") : `<p class="empty">Defina limites mensais por categoria para acompanhar seus gastos.</p>`}
  </section>`;
}

function backupDue() {
  const s = state.settings, today = todayIso();
  if (DEMO || state.transactions.length < 15) return false;
  if (s.backupSnooze && s.backupSnooze > today) return false;
  return !s.lastBackup || daysBetween(s.lastBackup, today) >= 30;
}

function renderDashboard() {
  if (!state.transactions.length) {
    return `<section class="card empty">
      <p><b>Bem-vindo ao Titanium!</b></p>
      <p>Registre sua primeira movimentação ou veja o app funcionando com dados de exemplo.</p>
      <div class="menu"><button class="btn primary" data-action="new">Adicionar movimentação</button>
      <button class="btn" data-action="demo">Carregar dados de exemplo</button></div></section>`;
  }
  const p = period(), today = todayIso(), items = transactionsIn(state.transactions, p, today), s = summarize(items);
  const before = previousPeriod(p, today), prev = before ? summarize(transactionsIn(state.transactions, before, today)) : null;
  const versus = comparisonLabel(p, today);
  const c = {
    p, today, items, s, prev, versus,
    dBal: deltaText(s.balance, prev && prev.balance, versus),
    dInc: deltaText(s.income, prev && prev.income, versus),
    dExp: deltaText(s.expense, prev && prev.expense, versus, true),
  };
  const visible = dashboardLayout().filter(widgetVisible);
  return `${backupDue() ? `<section class="card notice"><b>Que tal salvar um backup?</b>
      <p class="hint">Seus dados ficam só neste aparelho. Um backup leva um toque e evita perder tudo se o celular for trocado ou formatado.</p>
      <div class="menu"><button class="btn primary" type="button" data-action="export-json">Salvar backup agora</button><button class="btn" type="button" data-action="backup-later">Lembrar em 7 dias</button></div></section>` : ""}
    ${visible.length ? visible.map((w) => w.render(c)).join("") : `<section class="card empty"><p>Todos os blocos estão escondidos.</p></section>`}
    <div class="menu"><button class="btn" type="button" data-action="customize">${icon("layout")} Personalizar painel</button></div>`;
}

// ------------------------------------------------------------- movimentações

function renderTransactions() {
  const cats = allCategories(), types = allTypes();
  if (ui.category && !cats.includes(ui.category)) ui.category = "";
  if (ui.type && !types.includes(ui.type)) ui.type = "";
  return `
    <div class="filters">
      <input id="search" type="search" placeholder="Buscar descrição, categoria ou tipo…" value="${esc(ui.text)}" autocomplete="off" aria-label="Buscar">
      <div class="seg" id="kinds" role="group" aria-label="Tipo">${KIND_FILTERS.map(([label]) => `<button type="button" data-kind="${label}" aria-pressed="${ui.kind === label}">${label}</button>`).join("")}</div>
      <div class="row">
        <button type="button" class="picker" data-pick="cat-filter" aria-label="Filtrar por categoria">${ui.category ? badge(categoryMeta(ui.category), "ibadge sm") : `<span class="ibadge sm" style="--ic:#94A3B8">${icon("layout")}</span>`}<span>${esc(ui.category || "Categorias")}</span>${CHEV}</button>
        <button type="button" class="picker" data-pick="type-filter" aria-label="Filtrar por nome do tipo">${ui.type ? badge(typeMeta(ui.type, cardNames()), "ibadge sm") : `<span class="ibadge sm" style="--ic:#94A3B8">${icon("tag")}</span>`}<span>${esc(ui.type || "Tipos")}</span>${CHEV}</button>
      </div>
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
  const kind = KIND_FILTERS.find(([label]) => label === ui.kind)[1], today = todayIso();
  const rows = sortRecent(filterTransactions(transactionsIn(state.transactions, period(), today), { kind, category: ui.category || null, type: ui.type || null, text: ui.text }));
  // Saldo do dia = saldo anterior + lançamentos do dia, calculado sobre TODO o histórico (não só o que está filtrado).
  const balances = new Map(dailyBalances(expandRange(state.transactions, null, null, today), state.settings.openingBalance).map((d) => [d.date, d]));
  let html = "", last = "";
  for (const t of rows) {
    if (t.date !== last) {
      const b = balances.get(t.date);
      html += `${last ? "</div>" : ""}<div class="day"><span>${dayLabel(t.date, today)}</span>${b ? `<span class="bal">Saldo ${formatBrl(b.after)}</span>` : ""}</div>
        ${b ? `<p class="day-math">${formatBrl(b.before)} ${b.change >= 0 ? "+" : "−"} ${formatBrl(Math.abs(b.change))} = ${formatBrl(b.after)}</p>` : ""}<div class="list">`;
      last = t.date;
    }
    html += transactionRow(t, today);
  }
  const filtered = ui.text.trim() || ui.kind !== "Todos" || ui.category || ui.type;
  $("#list").innerHTML = rows.length ? html + "</div>" : `<section class="card empty"><p>${filtered ? "Nada encontrado com esses filtros." : "Nenhuma movimentação neste período."}</p>${filtered ? "" : `<button class="btn primary" data-action="new">Adicionar movimentação</button>`}</section>`;
  const s = summarize(rows);
  $("#summary").innerHTML = rows.length ? `${s.count} ${s.count === 1 ? "movimentação" : "movimentações"} · Saldo ${formatBrl(s.balance)}<br>Receitas ${formatBrl(s.income)} · Despesas ${formatBrl(s.expense)}` : "";
}

// ------------------------------------------------------------------ mês a mês

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const MONTH_FILTERS = [
  ["all", "Tudo", () => true],
  ["receitas", "Entradas", (t) => t.kind === INCOME],
  ["fixas", "Fixas", (t) => t.kind === EXPENSE && t.recurring],
  ["parcelas", "Parcelas", (t) => t.kind === EXPENSE && t.plan],
  ["avulsas", "Avulsas", (t) => t.kind === EXPENSE && !t.recurring && !t.plan],
];
// Os meses do seletor: 2 para trás e 12 para frente, sempre contados a partir de hoje (vira o ano sozinho).
const monthWindow = () => upcomingMonths(todayIso(), 2, 12);

function renderMonths() {
  const today = todayIso(), current = monthStart(today), months = monthWindow();
  if (!months.includes(ui.monthSel)) ui.monthSel = current;
  const views = months.map((m) => monthOverview(state.transactions, m, today));
  const maxAbs = Math.max(1, ...views.map((v) => Math.abs(v.balance)));
  const idx = months.indexOf(ui.monthSel), m = ui.monthSel, o = views[idx];

  // Trilho de meses: cada cartão mostra o saldo previsto e uma barrinha do tamanho dele.
  const rail = views.map((v, i) => {
    const iso = months[i], has = v.items.length > 0;
    const yearSep = i > 0 && iso.slice(5, 7) === "01" ? `<div class="myear" aria-hidden="true"><span>${iso.slice(0, 4)}</span></div>` : "";
    const h = has ? Math.max(10, Math.round((Math.abs(v.balance) / maxAbs) * 100)) : 0;
    return `${yearSep}<button type="button" class="mcard ${v.status}" data-msel="${iso}" aria-pressed="${iso === m}" aria-label="${esc(describeMonth(iso))}${has ? `, saldo ${formatBrl(v.balance)}` : ", sem lançamentos"}">
      <span class="mc-m">${monthName(iso).slice(0, 3)}</span>
      <span class="mc-bar"><i class="${v.balance < 0 ? "neg" : ""}" style="height:${h}%"></i></span>
      <span class="mc-v ${v.balance < 0 ? "neg" : ""}">${has ? `${v.balance < 0 ? "−" : "+"}${formatCompact(v.balance, { currency: false })}` : "—"}</span>
      ${iso === current ? `<span class="mc-now">hoje</span>` : ""}
    </button>`;
  }).join("");

  const status = { futuro: "Previsto", atual: "Em andamento", passado: "Encerrado" }[o.status];
  const balanceLabel = { futuro: "Sobra prevista", atual: "Sobra prevista no mês", passado: "Sobrou no mês" }[o.status];
  const base = Math.max(o.income, o.expense, 1);
  const segments = [
    ["Fixas", o.fixedExpense, "#A78BFA"],
    ["Parcelas", o.installmentExpense, "#60A5FA"],
    ["Avulsas", o.oneOffExpense, "#F59E0B"],
    ["Sobra", Math.max(0, o.balance), "var(--income)"],
  ].filter(([, v]) => v > 0);
  const stack = segments.map(([l, v, c]) => `<i style="width:${(v / base) * 100}%;background:${c}" title="${l}"></i>`).join("");
  const legend = segments.map(([l, v, c]) => `<li><i style="background:${c}"></i><span>${l}</span><b>${formatBrl(v, { cents: false })}</b>${o.income ? `<small>${Math.round((v / o.income) * 100)}%</small>` : ""}</li>`).join("");
  const advice = !o.items.length ? ""
    : o.expense > o.income ? `<p class="malert bad">${icon("alert")}<span>As saídas passam as entradas em <b>${formatBrl(o.expense - o.income)}</b>.</span></p>`
    : o.commitment !== null && o.commitment >= 0.7 ? `<p class="malert warn">${icon("alert")}<span>Fixas e parcelas já usam <b>${Math.round(o.commitment * 100)}%</b> da renda do mês.</span></p>`
    : o.income ? `<p class="malert ok">${icon("check")}<span>Fixas e parcelas usam <b>${Math.round((o.commitment ?? 0) * 100)}%</b> da renda: sobra espaço.</span></p>` : "";

  // Linha do tempo do mês, dia a dia, com filtro por natureza do lançamento.
  if (!MONTH_FILTERS.some(([k]) => k === ui.mfilter)) ui.mfilter = "all";
  const chips = MONTH_FILTERS.map(([k, label, fn]) => {
    const n = o.items.filter(fn).length;
    return n || k === "all" ? `<button type="button" class="fchip" data-mfilter="${k}" aria-pressed="${ui.mfilter === k}">${label}<span>${n}</span></button>` : "";
  }).join("");
  const rows = o.items.filter(MONTH_FILTERS.find(([k]) => k === ui.mfilter)[2]);
  const byDay = new Map();
  for (const t of rows) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  let timeline = "", nowShown = false;
  for (const [date, items] of byDay) {
    if (o.status === "atual" && !nowShown && date > today) {
      timeline += `<div class="tl-now">${icon("clock")}<span>Hoje, ${Number(today.slice(8))} de ${monthName(today)}</span></div>`;
      nowShown = true;
    }
    const net = items.reduce((a, t) => a + signed(t), 0);
    timeline += `<div class="tl-day${date < today ? " past" : ""}${date === today ? " today" : ""}">
        <span class="tl-date"><b>${Number(date.slice(8))}</b><small>${weekday(date).slice(0, 3)}</small></span>
        <div class="tl-items">${items.map((t) => transactionRow(t, today, { tagFuture: o.status === "atual", showDate: false })).join("")}</div>
      </div>${items.length > 1 ? `<p class="tl-sum">${weekday(date)}: ${formatBrl(net, { signed: true })}</p>` : ""}`;
  }

  return `
    <div class="mrail" id="strip" role="group" aria-label="Escolha o mês">${rail}</div>
    <section class="card mhero" id="mhero">
      <div class="mh-top">
        <button type="button" class="iconbtn" data-mstep="-1" ${idx === 0 ? "disabled" : ""} aria-label="Mês anterior">${icon("chevronLeft")}</button>
        <div class="mh-title"><h2>${esc(describeMonth(m).split(" de ")[0])}</h2><span>${m.slice(0, 4)} · <span class="pill ${o.status}">${status}</span></span></div>
        <button type="button" class="iconbtn" data-mstep="1" ${idx === months.length - 1 ? "disabled" : ""} aria-label="Próximo mês">${icon("chevronRight")}</button>
      </div>
      ${o.items.length ? `
      <div class="mh-balance"><span class="label">${balanceLabel}</span><b class="big ${o.balance < 0 ? "neg" : ""}">${formatBrl(o.balance)}</b></div>
      <div class="mh-io">
        <div>${badge({ icon: "arrowUp", color: "#34D399" }, "ibadge sm")}<span><small>Entradas</small><b class="in">${formatBrl(o.income, { cents: false })}</b></span></div>
        <div>${badge({ icon: "arrowDown", color: "#F87171" }, "ibadge sm")}<span><small>Saídas</small><b class="out">${formatBrl(o.expense, { cents: false })}</b></span></div>
      </div>
      <div class="stack" role="img" aria-label="Para onde vai o dinheiro do mês">${stack}</div>
      <ul class="stack-legend">${legend}</ul>
      ${advice}`
      : `<div class="mempty">${icon("calendar")}<p>Nada lançado em ${esc(monthName(m))} ainda.</p><small>Lançamentos fixos e financiamentos aparecem aqui sozinhos, mês a mês.</small></div>`}
    </section>
    ${o.items.length ? `<div class="fchips" role="group" aria-label="Filtrar o mês">${chips}</div>
    <div class="timeline">${timeline || `<p class="empty">Nada nesse filtro.</p>`}</div>` : ""}
    <div class="menu"><button class="btn primary" type="button" data-action="new">${icon("plus")} Lançar em ${esc(monthName(m))}</button></div>`;
}

function stepMonth(step) {
  const months = monthWindow(), i = months.indexOf(ui.monthSel) + step;
  if (i < 0 || i >= months.length) return;
  ui.monthSel = months[i];
  render({ keepScroll: true });
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
        <div class="budget-top"><div class="bname">${badge(categoryMeta(name), "ibadge")}<div><b>${esc(name)}</b><small class="${s ? s.level : ""}">${detail}</small></div></div>
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

// ------------------------------------------------------------- financiamentos

function renderFinancings() {
  const today = todayIso();
  const items = state.transactions.filter((t) => t.plan).map((t) => ({ t, s: financingSummary(t, today) }));
  const open = items.filter((x) => !x.s.done);
  const owed = round2(open.reduce((a, x) => a + x.s.balance, 0));
  const thisMonth = monthOverview(state.transactions, monthStart(today), today).installmentExpense;
  return `
    <button class="link back" type="button" data-page="Mais">${icon("chevronLeft")} Configurações</button>
    <section class="card">
      <div class="trio">
        <div><span class="label">Em andamento</span><b>${open.length}</b></div>
        <div><span class="label">Saldo devedor</span><b class="out">${formatBrl(owed, { cents: false })}</b></div>
        <div><span class="label">Parcelas do mês</span><b>${formatBrl(thisMonth, { cents: false })}</b></div>
      </div>
      <p class="hint">As parcelas entram sozinhas em cada mês (veja na aba Meses) e nos gráficos do painel.</p>
    </section>
    ${items.length ? items.map(({ t, s }) => `<section class="card fin">
      <div class="card-head"><div class="bname">${badge(categoryMeta(t.category === "Financiamento" ? "Financiamento" : t.category))}<div><h2>${esc(t.description)}</h2><p class="sub">${esc(FINANCING_SYSTEMS[t.plan.system])} · ${t.plan.count}x${t.plan.rate ? ` · ${String(t.plan.rate).replace(".", ",")}% a.m.` : ""}</p></div></div>
        <button class="link" type="button" data-fin-edit="${t.id}">Editar</button></div>
      <div class="budget-top"><b>${s.paidCount} de ${s.count} pagas</b><small>${Math.round(s.progress * 100)}%</small></div>
      <div class="meter" role="meter" aria-label="Progresso de ${esc(t.description)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.progress * 100)}"><i style="width:${s.progress * 100}%"></i></div>
      <div class="facts">
        <div><span class="label">${s.done ? "Quitado" : "Próxima parcela"}</span><b>${s.next ? `${formatBrl(s.next.payment)} · ${formatDate(s.next.date, { short: true })}` : "—"}</b></div>
        <div><span class="label">Saldo devedor</span><b>${formatBrl(s.balance)}</b></div>
        <div><span class="label">Já pago</span><b>${formatBrl(s.paidTotal)}</b></div>
        <div><span class="label">Falta pagar</span><b>${formatBrl(s.remainingTotal)}</b></div>
        <div><span class="label">Juros no total</span><b class="out">${formatBrl(s.interestTotal)}</b></div>
        <div><span class="label">Custo total</span><b>${formatBrl(s.total + t.plan.entry)}${t.plan.entry ? "" : ""}</b></div>
      </div>
      <details class="sched"><summary>Ver todas as parcelas</summary>
        <table><thead><tr><th>#</th><th>Vence</th><th>Parcela</th><th>Juros</th><th>Saldo</th></tr></thead><tbody>
        ${s.rows.map((r) => `<tr class="${r.date <= today ? "paid" : ""}"><td>${r.n}</td><td>${formatDate(r.date, { short: true })}</td><td>${formatBrl(r.payment)}</td><td>${formatBrl(r.interest)}</td><td>${formatBrl(r.balance, { cents: false })}</td></tr>`).join("")}
        </tbody></table></details>
    </section>`).join("") : `<section class="card empty"><p><b>Nenhum financiamento ainda.</b></p><p class="hint">Cadastre um carro, uma moto, um empréstimo ou uma compra parcelada: o app calcula as parcelas, os juros e o saldo devedor, e compara Price e SAC.</p></section>`}
    <div class="menu"><button class="btn primary" type="button" data-action="new-financing">+ Novo financiamento</button></div>`;
}

// --------------------------------------------------------------------- mais

function renderMore() {
  const iosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const p = state.profile, l = state.lock, fins = state.transactions.filter((t) => t.plan).length;
  const lockText = l.device || l.pin ? [l.device && "senha do celular", l.pin && "PIN"].filter(Boolean).join(" + ") : "desativado";
  const row = (action, ic, color, title, sub) => `<button type="button" class="row-btn" data-action="${action}">${badge({ icon: ic, color })}<span class="row-txt"><b>${title}</b><small>${sub}</small></span>${CHEV}</button>`;
  const themeIcon = { system: "monitor", light: "sun", dark: "moon" };
  return `
    <section class="card">
      <button type="button" class="profile-card" data-action="profile">
        <span class="avatar lg" style="background:${p.color}">${avatarInner()}</span>
        <span class="row-txt"><b>${p.name ? esc(p.name) : "Seu perfil"}</b><small>${p.photo || p.name ? "Editar nome e foto" : "Defina seu nome e uma foto da galeria"}</small></span>${CHEV}
      </button>
    </section>
    <section class="card"><h2>Aparência</h2>
      <div class="themes" role="group" aria-label="Tema">${THEMES.map(([value, label]) => `<button type="button" data-theme="${value}" aria-pressed="${state.settings.theme === value}">${icon(themeIcon[value])}<span>${label}</span></button>`).join("")}</div>
    </section>
    <section class="card rows">
      ${row("security", "lock", "#F472B6", "Segurança e bloqueio", `Bloqueio: ${lockText}`)}
      ${row("cards", "card", "#60A5FA", "Cartões de crédito", state.cards.length ? `${state.cards.length} cadastrado${state.cards.length > 1 ? "s" : ""}` : "Controle o limite")}
      ${row("types", "tag", "#F59E0B", "Tipos de lançamento", "Pix, boleto, cartão e os seus")}
      ${row("financing", "bank", "#818CF8", "Financiamentos", fins ? `${fins} cadastrado${fins > 1 ? "s" : ""}` : "Parcelas, juros e saldo devedor")}
      ${row("customize", "layout", "#2DD4BF", "Personalizar painel", "Escolha e ordene os blocos")}
      ${row("opening", "scale", "#A78BFA", "Saldo inicial", state.settings.openingBalance ? formatBrl(state.settings.openingBalance) : "Para o saldo do dia bater com o banco")}
    </section>
    <section class="card"><h2>Seus dados</h2>
      <div class="menu" style="margin-top:10px">
        <button class="btn" data-action="export-csv">${icon("download")} Exportar planilha (CSV)</button>
        <button class="btn" data-action="export-json">${icon("download")} Salvar backup (JSON)</button>
        <button class="btn" data-action="import">${icon("upload")} Importar CSV ou backup</button>
      </div>
      <p class="hint">${state.settings.lastBackup ? `Último backup: ${formatDate(state.settings.lastBackup)}. ` : "Você ainda não salvou um backup. "}O CSV é o mesmo do app de computador.</p>
    </section>
    <section class="card"><h2>Instalar no celular</h2>
      ${installed ? `<p class="hint ok">${icon("check")} O Titanium já está instalado neste aparelho.</p>`
        : ui.installEvent ? `<div class="menu" style="margin-top:10px"><button class="btn primary" data-action="install">${icon("phone")} Instalar app</button></div>`
        : iosHint ? `<p class="hint">No iPhone: toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</p>`
        : `<p class="hint">No Chrome: menu ⋮ → <b>Instalar app</b>. O Titanium funciona offline depois de aberto uma vez. Instalado, ele também aparece no menu <b>Compartilhar</b> do celular: compartilhe a notificação de um Pix com o Titanium e ele monta o lançamento.</p>`}
    </section>
    <section class="card"><h2>Zona de cuidado</h2>
      <div class="menu" style="margin-top:10px">
        <button class="btn" data-action="demo">${icon("sparkle")} Carregar dados de exemplo</button>
        <button class="btn danger" data-action="wipe">${icon("trash")} Apagar lançamentos, cartões e orçamentos</button>
      </div>
    </section>
    <p class="about">Titanium Finance v${VERSION}<br>Grátis, sem anúncios, sem limite de lançamentos e sem assinatura.<br>${DEMO ? "Modo demonstração: nada é salvo." : `${state.transactions.length} movimentações · tudo guardado só neste aparelho.`}</p>`;
}

async function shareOrDownload(filename, text, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    ui.skipRelockUntil = Date.now() + 20_000;
    try { await navigator.share({ files: [file], title: filename }); return true; } catch (e) { if (e.name === "AbortError") return false; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${filename} salvo.`);
  return true;
}

const keyOf = (t) => [t.date, t.description.toLocaleLowerCase("pt-BR"), t.amount, t.kind, t.category.toLocaleLowerCase("pt-BR"), t.recurring ? "fixo" : "", t.plan ? "plano" : "", t.type, t.subcategory].join("|");

function mergeImported(items) {
  const known = new Set(state.transactions.map(keyOf));
  const fresh = items.filter((t) => !known.has(keyOf(t)) && known.add(keyOf(t)));
  addTransactions(fresh);
  return fresh.length;
}

/** Uma linha de backup JSON (de qualquer versão) → movimentação válida. */
function fromBackup(raw) {
  if (raw.plan) {
    return makeFinancing({ description: raw.description, principal: raw.plan.principal, entry: raw.plan.entry, rate: raw.plan.rate, rateUnit: "mes", count: raw.plan.count, system: raw.plan.system, when: raw.date, category: raw.category, type: raw.type });
  }
  return makeTransaction({ description: raw.description, amount: raw.amount, kind: raw.kind, category: raw.category, when: raw.date, recurring: raw.recurring === true, until: raw.until ?? "", type: raw.type, subcategory: raw.subcategory });
}

async function importFile(file) {
  const text = await file.text();
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.transactions)) throw new Error("formato");
      const valid = [];
      for (const raw of data.transactions) { try { valid.push(fromBackup(raw)); } catch { /* ignora a linha */ } }
      const added = mergeImported(valid);
      for (const [c, v] of Object.entries(data.budgets ?? {})) if (typeof v === "number" && v > 0) state.budgets[c] = v;
      for (const c of Array.isArray(data.cards) ? data.cards : []) {
        if (c && typeof c.name === "string" && !state.cards.some((x) => x.name === c.name) && c.limit > 0 && c.closingDay >= 1 && c.closingDay <= 31) state.cards.push({ name: c.name.slice(0, 40), limit: c.limit, closingDay: c.closingDay, dueDay: c.dueDay ?? null });
      }
      for (const t of Array.isArray(data.types) ? data.types : []) if (typeof t === "string" && t && !state.types.includes(t)) state.types.push(t.slice(0, 40));
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

// ----------------------------------------------------------------- lançamento

const sheet = $("#sheet"), form = $("#sheet-form");
let editing = null;

function fillCategories(selected) {
  const cats = allCategories();
  if (selected && !cats.includes(selected)) cats.push(selected);
  $("#f-category").innerHTML = cats.map((c) => `<option ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("") + `<option value="__new__">＋ Nova categoria…</option>`;
  $("#f-new-wrap").hidden = true;
  fillSubcategories(selected);
  syncPickers();
}

function fillSubcategories(category) {
  $("#subs").innerHTML = subcategoriesOf(category ?? "").map((s) => `<option value="${esc(s)}"></option>`).join("");
}

function fillTypes(selected) {
  const types = allTypes();
  if (selected && !types.includes(selected)) types.push(selected);
  $("#f-type").innerHTML = `<option value="">— sem nome —</option>${types.map((t) => `<option ${t === selected ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="__new__">＋ Novo tipo…</option>`;
  $("#f-type-new-wrap").hidden = true;
  syncPickers();
}

const GREY = "#94A3B8";

/** Os botões que mostram categoria e tipo escolhidos (com ícone), no lugar das listas do sistema. */
function syncPickers() {
  const c = $("#f-category").value, t = $("#f-type").value;
  $("#f-category-btn").innerHTML = c === "__new__"
    ? `<span class="ibadge sm" style="--ic:${GREY}">${icon("plus")}</span><span>Nova categoria</span>${CHEV}`
    : `${badge(categoryMeta(c), "ibadge sm")}<span>${esc(c)}</span>${CHEV}`;
  $("#f-type-btn").innerHTML = t && t !== "__new__"
    ? `${badge(typeMeta(t, cardNames()), "ibadge sm")}<span>${esc(t)}</span>${CHEV}`
    : `<span class="ibadge sm" style="--ic:${GREY}">${icon(t === "__new__" ? "plus" : "tag")}</span><span>${t === "__new__" ? "Novo tipo" : "Nenhum"}</span>${CHEV}`;
}

function setSelect(selector, value) {
  const el = $(selector);
  el.value = value;
  el.dispatchEvent(new Event("change"));
  syncPickers();
}

/** Grade de opções com ícone, numa folha. */
function openPicker(which) {
  const cats = allCategories(), types = allTypes(), cards = cardNames();
  const catOpts = cats.map((c) => ({ value: c, label: c, meta: categoryMeta(c) }));
  const typeOpts = types.map((t) => ({ value: t, label: t, meta: typeMeta(t, cards) }));
  const extra = (value, label, ic) => ({ value, label, meta: { icon: ic, color: GREY } });
  const conf = {
    category: { title: "Categoria", options: [...catOpts, extra("__new__", "Nova categoria", "plus")], current: $("#f-category").value, pick: (v) => setSelect("#f-category", v) },
    type: { title: "Nome do tipo", options: [extra("", "Nenhum", "dots"), ...typeOpts, extra("__new__", "Novo tipo", "plus")], current: $("#f-type").value, pick: (v) => setSelect("#f-type", v) },
    "cat-filter": { title: "Filtrar por categoria", options: [extra("", "Todas", "layout"), ...catOpts], current: ui.category, pick: (v) => { ui.category = v; render({ keepScroll: true }); } },
    "type-filter": { title: "Filtrar por nome do tipo", options: [extra("", "Todos", "tag"), ...typeOpts], current: ui.type, pick: (v) => { ui.type = v; render({ keepScroll: true }); } },
  }[which];
  if (!conf) return;
  panels.open({
    title: conf.title,
    body: `<div class="pgrid">${conf.options.map((o) => `<button type="button" class="ptile" data-act="pick" data-value="${esc(o.value)}" aria-pressed="${o.value === conf.current}">${badge(o.meta)}<span>${esc(o.label)}</span></button>`).join("")}</div>`,
    actions: { pick: (b) => { panels.close(); conf.pick(b.dataset.value); } },
  });
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

/** Entende o texto de uma notificação do banco e preenche o formulário (receita ou despesa, valor, nome do tipo). */
function applyBankText(text) {
  const r = parseBankText(text), msg = $("#bank-msg");
  if (r.amount === null && !r.kind && !r.description) { msg.textContent = "Não achei um valor nessa mensagem. Confira o texto."; return; }
  if (r.amount !== null) $("#f-amount").value = r.amount.toFixed(2).replace(".", ",");
  if (r.kind) {
    form.elements.kind.value = r.kind;
    if (!editing) fillCategories(DEFAULT_CATEGORY[r.kind]);
  }
  if (r.description) $("#f-description").value = r.description;
  $("#f-date").value = r.date;
  if (r.type) fillTypes(r.type === "Cartão de crédito" && state.cards.length === 1 ? state.cards[0].name : r.type);
  syncFrequency();
  msg.textContent = r.kind
    ? `Entendi: ${r.kind.toLowerCase()}${r.amount !== null ? ` de ${formatBrl(r.amount)}` : ""}${r.type ? ` via ${r.type}` : ""}. Confira e salve.`
    : "Achei o valor, mas não sei se é receita ou despesa: escolha acima.";
}

function openSheet(id = null, { month = null, bank = "" } = {}) {
  editing = id === null ? null : state.transactions.find((t) => t.id === id && !t.plan) ?? null;
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
  $("#f-sub").value = editing?.subcategory ?? "";
  fillTypes(editing ? editing.type : state.settings.lastType);
  $("#f-new").value = "";
  $("#f-type-new").value = "";
  $("#f-all").checked = false;
  $("#f-all-wrap").hidden = !editing;
  $("#bank-wrap").hidden = !bank;
  $("#bank-text").value = bank;
  $("#bank-msg").textContent = "";
  $("#sheet-error").textContent = "";
  $("#f-delete").hidden = !editing;
  sheet.showModal();
  if (bank) applyBankText(bank);
  else if (!editing) $("#f-description").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const category = $("#f-category").value === "__new__" ? $("#f-new").value : $("#f-category").value;
  const typeName = $("#f-type").value === "__new__" ? $("#f-type-new").value : $("#f-type").value;
  try {
    const t = makeTransaction({
      description: $("#f-description").value, amount: $("#f-amount").value, kind: form.elements.kind.value,
      category, when: $("#f-date").value, recurring: form.elements.freq.value === "monthly", until: $("#f-until").value,
      type: typeName, subcategory: $("#f-sub").value,
    });
    const target = editing, applyAll = Boolean(target) && $("#f-all").checked;
    // Decide agora (antes de gravar) se o tipo é novo: depois de gravado, ele já "existiria" nos lançamentos.
    const brandNewType = $("#f-type").value === "__new__" && t.type && !allTypes().some((x) => sameText(x, t.type));
    const apply = () => {
      if (target) Object.assign(target, t); else addTransactions([t]);
      if (applyAll) {
        for (const x of state.transactions) {
          if (x !== target && !x.plan && sameText(x.description, t.description)) Object.assign(x, { category: t.category, subcategory: t.subcategory, type: t.type });
        }
      }
      if (brandNewType) state.types.push(t.type);
      state.settings.lastKind = t.kind;
      state.settings.lastCategory = t.category;
      state.settings.lastType = t.type;
    };
    sheet.close();
    if (target) {
      withUndo(apply, applyAll ? `Atualizadas todas as “${t.description}”.` : "Movimentação atualizada.");
    } else {
      apply();
      persist();
      toast(`Adicionada${t.recurring ? " (fixa todo mês)" : ""}: ${formatBrl(signed(t), { signed: true })}.`);
      render({ keepScroll: true });
    }
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
  if (e.target.value === "__new__") $("#f-new").focus(); else fillSubcategories(e.target.value);
});
$("#f-type").addEventListener("change", (e) => {
  $("#f-type-new-wrap").hidden = e.target.value !== "__new__";
  if (e.target.value === "__new__") $("#f-type-new").focus();
});

// Repete tipo, categoria, subcategoria e nome do tipo da última vez que essa descrição foi usada.
$("#f-description").addEventListener("blur", () => {
  if (editing) return;
  const typed = $("#f-description").value.trim();
  const match = typed && sortRecent(state.transactions).find((t) => sameText(t.description, typed) && !t.plan);
  if (match) { form.elements.kind.value = match.kind; fillCategories(match.category); $("#f-sub").value = match.subcategory; fillTypes(match.type); }
});

$("#bank-toggle").addEventListener("click", () => { $("#bank-wrap").hidden = !$("#bank-wrap").hidden; if (!$("#bank-wrap").hidden) $("#bank-text").focus(); });
$("#bank-go").addEventListener("click", () => applyBankText($("#bank-text").value));

$("#f-cancel").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
$("#f-delete").addEventListener("click", () => {
  const what = editing?.recurring ? `Excluir o lançamento fixo “${editing.description}” (${formatBrl(signed(editing), { signed: true })} todo mês)?\n\nEle some de todos os meses, inclusive dos passados.`
    : editing ? `Excluir “${editing.description}” (${formatBrl(signed(editing), { signed: true })}, ${formatDate(editing.date)})?` : "";
  if (!editing || !confirm(what)) return;
  const id = editing.id;
  sheet.close();
  withUndo(() => { state.transactions = state.transactions.filter((t) => t.id !== id); }, "Movimentação excluída.");
});
document.querySelectorAll("[data-date]").forEach((chip) => chip.addEventListener("click", () => {
  $("#f-date").value = addDays(todayIso(), -Number(chip.dataset.date));
  syncFrequency();
}));

// ---------------------------------------------------------------- navegação

function updateAvatar() {
  const avatar = $("#avatar"), p = state.profile;
  avatar.style.background = p.color;
  avatar.innerHTML = avatarInner();
  avatar.setAttribute("aria-label", p.name ? `Configurações de ${p.name}` : "Configurações");
}

/** Troca cada <span data-icon="nome"> pelo SVG do ícone (barra de abas, formulário…). */
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}

function render({ keepScroll = false } = {}) {
  const y = window.scrollY, page = ui.page, today = todayIso(), name = state.profile.name;
  $("#title").textContent = TITLES[page];
  $("#subtitle").textContent = {
    Painel: name ? `Olá, ${name} · ${describePeriod(period())}` : `${describePeriod(period())} · seus números em um só lugar`,
    Meses: "Despesas e receitas, mês a mês",
    Movimentações: `${describePeriod(period())} · toque para editar`,
    Orçamentos: `Limites mensais · ${monthName(today)} de ${today.slice(0, 4)}`,
    Financiamentos: "Parcelas, juros e saldo devedor",
    Mais: "Perfil, aparência, segurança e dados",
  }[page];
  updateAvatar();

  const seg = $("#period");
  seg.hidden = !(page === "Painel" || page === "Movimentações");
  seg.innerHTML = PERIODS.map((p) => `<button type="button" data-period="${p}" aria-pressed="${state.settings.period === p}">${p}</button>`).join("");

  $("#view").innerHTML = { Painel: renderDashboard, Meses: renderMonths, Movimentações: renderTransactions, Orçamentos: renderBudgets, Financiamentos: renderFinancings, Mais: renderMore }[page]();
  if (page === "Movimentações") updateList();
  if (page === "Meses") centerSelectedMonth();
  const tab = page === "Financiamentos" ? "Mais" : page;
  document.querySelectorAll("#tabs button").forEach((b) => {
    if (b.dataset.page === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $("#fab").hidden = page === "Mais";
  window.scrollTo(0, keepScroll ? y : 0);
}

function go(page) {
  ui.page = page;
  render();
}

/** Na aba "Meses", o novo lançamento já nasce dentro do mês que está aberto. */
function newTransaction() {
  openSheet(null, ui.page === "Meses" ? { month: ui.monthSel } : {});
}

function editTransaction(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (t?.plan) panels.financing(id); else openSheet(id);
}

function wipeAll() {
  clearAll();
  location.reload();
}

const ACTIONS = {
  new: () => newTransaction(),
  "new-financing": () => panels.financing(),
  customize: () => panels.customize(),
  profile: () => panels.profile(),
  security: () => panels.security(),
  cards: () => panels.cards(),
  types: () => panels.types(),
  opening: () => panels.opening(),
  financing: () => go("Financiamentos"),
  "lock-now": () => lock.lockNow(),
  "backup-later": () => { state.settings.backupSnooze = addDays(todayIso(), 7); persist(); render({ keepScroll: true }); },
  demo: () => {
    if (state.transactions.length && !confirm("Adicionar dados de exemplo aos que você já tem?")) return;
    addTransactions(demoTransactions());
    if (!Object.keys(state.budgets).length) state.budgets = { ...DEMO_BUDGETS };
    if (!state.cards.length) state.cards = DEMO_CARDS.map((c) => ({ ...c }));
    persist(); toast("Dados de exemplo carregados."); render();
  },
  wipe: () => {
    if (!confirm("Apagar TODAS as movimentações, cartões e orçamentos deste aparelho?\n\nVocê poderá desfazer por alguns segundos. Considere salvar um backup antes.")) return;
    withUndo(() => { state.transactions = []; state.budgets = {}; state.cards = []; state.types = []; state.nextId = 1; }, "Dados apagados.");
  },
  "export-csv": () => {
    if (!state.transactions.length) return toast("Não há movimentações para exportar.");
    return shareOrDownload(`titanium-${todayIso()}.csv`, exportCsv(sortRecent(state.transactions)), "text/csv");
  },
  "export-json": async () => {
    const ok = await shareOrDownload(`titanium-backup-${todayIso()}.json`, JSON.stringify(backupData(state), null, 2), "application/json");
    if (ok) { state.settings.lastBackup = todayIso(); state.settings.backupSnooze = null; persist(); render({ keepScroll: true }); }
  },
  import: () => { ui.skipRelockUntil = Date.now() + 20_000; $("#file").click(); },
  install: async () => { const prompt = ui.installEvent; ui.installEvent = null; await prompt.prompt(); render({ keepScroll: true }); },
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("button, [data-month], [data-edit]");
  if (!el) return;
  const d = el.dataset;
  if (d.msel) { ui.monthSel = d.msel; return ui.page === "Meses" ? render({ keepScroll: true }) : go("Meses"); }
  if (d.page) return go(d.page);
  if (d.pick) return openPicker(d.pick);
  if (d.mstep) return stepMonth(Number(d.mstep));
  if (d.mfilter) { ui.mfilter = d.mfilter; return render({ keepScroll: true }); }
  if (d.period) { state.settings.period = d.period; persist(); return render({ keepScroll: true }); }
  if (d.edit) return editTransaction(Number(d.edit));
  if (d.finEdit) return panels.financing(Number(d.finEdit));
  if (d.catview) { state.settings.categoryView = d.catview; persist(); return render({ keepScroll: true }); }
  if (d.kind) { ui.kind = d.kind; $("#kinds").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.kind === ui.kind)); return updateList(); }
  if (d.theme) { state.settings.theme = d.theme; persist(); applyTheme(); return render({ keepScroll: true }); }
  if (d.action && ACTIONS[d.action]) return ACTIONS[d.action]();
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
  if (event.target.id === "type-filter") { ui.type = event.target.value; updateList(); }
  if (event.target.dataset?.budget !== undefined) saveBudget(event.target);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.dataset?.budget !== undefined) event.target.blur();
});
$("#fab").addEventListener("click", () => (ui.page === "Financiamentos" ? panels.financing() : newTransaction()));
$("#avatar").addEventListener("click", () => go("Mais"));

// Arrastar o cartão do mês para o lado troca de mês.
let touchX = null;
$("#view").addEventListener("touchstart", (e) => { touchX = e.target.closest("#mhero") ? e.touches[0].clientX : null; }, { passive: true });
$("#view").addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) stepMonth(dx < 0 ? 1 : -1);
});
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
document.addEventListener("visibilitychange", () => { if (!document.hidden && !sheet.open && !ui.locked) render({ keepScroll: true }); });

// --------------------------------------------------------------------- início

// Texto compartilhado de outro app (ex.: notificação de Pix) chega em ?text= quando o app está instalado.
let pendingShare = DEMO ? "" : [params.get("title"), params.get("text")].filter(Boolean).join(" ").trim();

function afterUnlock() {
  render({ keepScroll: true });
  if (pendingShare) {
    const text = pendingShare;
    pendingShare = "";
    history.replaceState(null, "", location.pathname);
    openSheet(null, { bank: text });
  }
}

const app = {
  get state() { return state; },
  ui, persist, toast, render, withUndo, addTransactions,
  categories: allCategories, allTypes, widgetList, moveWidget, toggleWidget, resetDashboard,
  lockNow: () => lock.lockNow(), onUnlock: afterUnlock, wipeAll,
};
panels = createPanels(app);
lock = createLock(app);

hydrateIcons();
applyTheme();
if (!DEMO && lock.enabled()) lock.show();
render();
if (!ui.locked) afterUnlock();

if (DEMO) {
  const panel = params.get("panel");
  if (params.has("sheet")) {
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
  } else if (panel) {
    ({ perfil: () => panels.profile(), seguranca: () => panels.security(), cartoes: () => panels.cards(), tipos: () => panels.types(), personalizar: () => panels.customize(), financiamento: () => panels.financing() })[panel]?.();
    $("#panel").style.animation = "none";
  }
  if (params.has("lock")) { state.lock.pin = { salt: "x", hash: "x" }; lock.show({ auto: false }); }
  if (params.has("scroll")) window.scrollTo(0, Number(params.get("scroll")) || 0);
} else {
  navigator.storage?.persist?.();
  // Em localhost (desenvolvimento) o service worker atrapalha: ele guarda os arquivos antigos. Use ?sw para testá-lo.
  const dev = ["localhost", "127.0.0.1"].includes(location.hostname) && !params.has("sw");
  if ("serviceWorker" in navigator && !dev) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) toast("App atualizado. Feche e abra de novo para ver as novidades."); });
  }
}
