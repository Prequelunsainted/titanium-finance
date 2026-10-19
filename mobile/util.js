// Pequenos utilitários de interface.

export const $ = (selector, root = document) => root.querySelector(selector);

export const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Primeira letra do nome, para o avatar. */
export const initialOf = (name) => String(name ?? "").trim().charAt(0).toUpperCase();

/** Texto → número com sinal opcional ("-150,5", "1.200"); vazio vale 0. */
export function parseSigned(text, parse) {
  const raw = String(text ?? "").trim();
  if (!raw || /^[-+]?\s*0+([.,]0+)?$/.test(raw)) return 0;
  return raw.startsWith("-") ? -parse(raw.slice(1)) : parse(raw.replace(/^\+/, ""));
}
