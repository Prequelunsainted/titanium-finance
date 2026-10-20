// Armazenamento local (localStorage). Os dados nunca saem do aparelho.
// Se o navegador bloquear o armazenamento (aba anônima, por exemplo), o app continua
// funcionando só na memória e avisa que nada será guardado.

import { EXPENSE, FINANCING_SYSTEMS, INCOME, KINDS, PERIODS } from "./core.js";

const KEY = "titanium.mobile.v1";
export const PROFILE_COLORS = ["#2DD4BF", "#60A5FA", "#A78BFA", "#F472B6", "#F59E0B", "#34D399", "#F87171", "#94A3B8"];

export const defaults = () => ({
  version: 1,
  nextId: 1,
  transactions: [],
  budgets: {},
  cards: [],
  types: [],
  profile: { name: "", color: PROFILE_COLORS[0], photo: null },
  lock: { device: null, pin: null, timeout: 1 },
  settings: {
    theme: "system", period: "Mês", lastKind: EXPENSE, lastCategory: "Alimentação", lastType: "",
    openingBalance: 0, categoryView: "categoria", lastBackup: null, backupSnooze: null, dashboard: { order: [], visible: {} },
  },
});

const isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v, max = 40) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const finite = (v) => typeof v === "number" && Number.isFinite(v);

function validPlan(plan) {
  return plan && typeof plan === "object" && Object.hasOwn(FINANCING_SYSTEMS, plan.system) &&
    finite(plan.principal) && plan.principal > 0 && Number.isInteger(plan.count) && plan.count >= 1 && plan.count <= 480 &&
    finite(plan.rate) && plan.rate >= 0 && plan.rate <= 30 && finite(plan.entry) && plan.entry >= 0;
}

function validTransaction(t) {
  return t && Number.isInteger(t.id) && typeof t.description === "string" && t.description &&
    finite(t.amount) && t.amount > 0 && KINDS.includes(t.kind) &&
    typeof t.category === "string" && isIso(t.date);
}

function sanitizeTransaction(t) {
  const plan = validPlan(t.plan)
    ? { system: t.plan.system, principal: t.plan.principal, entry: t.plan.entry, rate: t.plan.rate, count: t.plan.count } : null;
  const recurring = !plan && t.recurring === true;
  return {
    id: t.id, description: t.description, amount: t.amount, kind: plan ? EXPENSE : t.kind, category: t.category, date: t.date,
    // Dados salvos em versões anteriores não têm os campos novos: viram avulsos, sem tipo nem subcategoria.
    recurring,
    until: recurring && typeof t.until === "string" && /^\d{4}-\d{2}$/.test(t.until) ? t.until : null,
    type: str(t.type), subcategory: str(t.subcategory), plan,
  };
}

function sanitizeCards(list) {
  const seen = new Set(), out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const name = str(c?.name);
    if (!name || seen.has(name) || !finite(c.limit) || c.limit <= 0) continue;
    const day = (v) => (Number.isInteger(v) && v >= 1 && v <= 31 ? v : null);
    const closingDay = day(c.closingDay);
    if (!closingDay) continue;
    seen.add(name);
    out.push({ name, limit: c.limit, closingDay, dueDay: day(c.dueDay) });
  }
  return out;
}

/** Lê o que está salvo, descartando com cuidado qualquer coisa fora do formato. */
export function sanitize(data) {
  const state = defaults();
  if (!data || typeof data !== "object") return state;

  state.transactions = (Array.isArray(data.transactions) ? data.transactions : []).filter(validTransaction).map(sanitizeTransaction);
  const maxId = state.transactions.reduce((m, t) => Math.max(m, t.id), 0);
  state.nextId = Math.max(Number.isInteger(data.nextId) ? data.nextId : 1, maxId + 1);

  if (data.budgets && typeof data.budgets === "object") {
    for (const [category, limit] of Object.entries(data.budgets)) {
      if (finite(limit) && limit > 0) state.budgets[category] = limit;
    }
  }
  state.cards = sanitizeCards(data.cards);
  state.types = [...new Set((Array.isArray(data.types) ? data.types : []).map((t) => str(t)).filter(Boolean))];

  const profile = data.profile ?? {};
  state.profile.name = str(profile.name);
  if (typeof profile.color === "string" && /^#[0-9a-f]{6}$/i.test(profile.color)) state.profile.color = profile.color;
  // Foto do perfil: só imagem embutida (data URL) e pequena (o app reduz para 256×256 ao escolher).
  if (typeof profile.photo === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(profile.photo) && profile.photo.length < 600_000) {
    state.profile.photo = profile.photo;
  }

  const lock = data.lock ?? {};
  if (typeof lock.device === "string" && /^[\w-]{8,512}$/.test(lock.device)) state.lock.device = lock.device;
  if (lock.pin && typeof lock.pin.salt === "string" && typeof lock.pin.hash === "string") state.lock.pin = { salt: lock.pin.salt, hash: lock.pin.hash };
  if ([0, 1, 5, 15].includes(lock.timeout)) state.lock.timeout = lock.timeout;

  const s = data.settings ?? {};
  if (["system", "light", "dark"].includes(s.theme)) state.settings.theme = s.theme;
  if (PERIODS.includes(s.period)) state.settings.period = s.period;
  if ([INCOME, EXPENSE].includes(s.lastKind)) state.settings.lastKind = s.lastKind;
  if (typeof s.lastCategory === "string" && s.lastCategory) state.settings.lastCategory = s.lastCategory;
  state.settings.lastType = str(s.lastType);
  if (finite(s.openingBalance) && Math.abs(s.openingBalance) < 1e10) state.settings.openingBalance = s.openingBalance;
  if (["categoria", "subcategoria"].includes(s.categoryView)) state.settings.categoryView = s.categoryView;
  if (isIso(s.lastBackup)) state.settings.lastBackup = s.lastBackup;
  if (isIso(s.backupSnooze)) state.settings.backupSnooze = s.backupSnooze;
  const dash = s.dashboard ?? {};
  state.settings.dashboard.order = (Array.isArray(dash.order) ? dash.order : []).filter((id) => typeof id === "string");
  for (const [id, visible] of Object.entries(dash.visible ?? {})) if (typeof visible === "boolean") state.settings.dashboard.visible[id] = visible;
  return state;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

/** Devolve false se não foi possível gravar. */
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Apaga tudo o que o app guardou neste aparelho (dados, bloqueio e contagem de tentativas). */
export function clearAll() {
  try { localStorage.removeItem(KEY); localStorage.removeItem("titanium.lockfails"); } catch { /* sem armazenamento */ }
}

/** O que vai no backup: tudo, menos o bloqueio (o PIN e a chave do celular não saem deste aparelho). */
export function backupData(state) {
  const { lock, nextId, ...rest } = state;
  return { app: "titanium", ...rest, version: 2, exportedAt: new Date().toISOString(), transactions: state.transactions.map(({ id, ...t }) => t) };
}
