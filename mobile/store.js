// Armazenamento local (localStorage). Os dados nunca saem do aparelho.
// Se o navegador bloquear o armazenamento (aba anônima, por exemplo), o app continua
// funcionando só na memória e avisa que nada será guardado.

import { EXPENSE, INCOME, KINDS, PERIODS } from "./core.js";

const KEY = "titanium.mobile.v1";

export const defaults = () => ({
  version: 1,
  nextId: 1,
  transactions: [],
  budgets: {},
  settings: { theme: "system", period: "Mês", lastKind: EXPENSE, lastCategory: "Alimentação" },
});

const isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function validTransaction(t) {
  return t && Number.isInteger(t.id) && typeof t.description === "string" && t.description &&
    typeof t.amount === "number" && t.amount > 0 && KINDS.includes(t.kind) &&
    typeof t.category === "string" && isIso(t.date);
}

/** Lê o que está salvo, descartando com cuidado qualquer coisa fora do formato. */
export function sanitize(data) {
  const state = defaults();
  if (!data || typeof data !== "object") return state;

  state.transactions = (Array.isArray(data.transactions) ? data.transactions : []).filter(validTransaction).map((t) => ({
    id: t.id, description: t.description, amount: t.amount, kind: t.kind, category: t.category, date: t.date,
    // Dados salvos antes dos lançamentos fixos não têm esses campos: viram avulsos.
    recurring: t.recurring === true,
    until: t.recurring === true && typeof t.until === "string" && /^\d{4}-\d{2}$/.test(t.until) ? t.until : null,
  }));
  const maxId = state.transactions.reduce((m, t) => Math.max(m, t.id), 0);
  state.nextId = Math.max(Number.isInteger(data.nextId) ? data.nextId : 1, maxId + 1);

  if (data.budgets && typeof data.budgets === "object") {
    for (const [category, limit] of Object.entries(data.budgets)) {
      if (typeof limit === "number" && limit > 0) state.budgets[category] = limit;
    }
  }
  const s = data.settings ?? {};
  if (["system", "light", "dark"].includes(s.theme)) state.settings.theme = s.theme;
  if (PERIODS.includes(s.period)) state.settings.period = s.period;
  if ([INCOME, EXPENSE].includes(s.lastKind)) state.settings.lastKind = s.lastKind;
  if (typeof s.lastCategory === "string" && s.lastCategory) state.settings.lastCategory = s.lastCategory;
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
