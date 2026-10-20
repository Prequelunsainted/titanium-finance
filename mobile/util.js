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

// ------------------------------------------------- recorte da foto (contas puras)
// "view" = { w, h (tamanho da imagem), stage (lado do quadro na tela), zoom (1 = cobre o quadro), x, y (canto da imagem no quadro) }

export const CROP_MAX_ZOOM = 5;

/** Prende zoom e posição para a imagem sempre cobrir o quadro (e, portanto, o círculo). Devolve a view com `scale`. */
export function fitCrop(view) {
  const zoom = Math.min(Math.max(view.zoom, 1), CROP_MAX_ZOOM);
  const scale = (view.stage / Math.min(view.w, view.h)) * zoom;
  const clamp = (v, size) => Math.min(0, Math.max(view.stage - size * scale, v));
  return { ...view, zoom, scale, x: clamp(view.x, view.w), y: clamp(view.y, view.h) };
}

/** Imagem centralizada no quadro, sem zoom. */
export function centerCrop(w, h, stage) {
  const scale = stage / Math.min(w, h);
  return fitCrop({ w, h, stage, zoom: 1, x: (stage - w * scale) / 2, y: (stage - h * scale) / 2 });
}

/** Muda o zoom mantendo parado o ponto (px, py) do quadro (o centro da pinça ou do quadro). */
export function zoomCrop(view, zoom, px = view.stage / 2, py = view.stage / 2) {
  const before = fitCrop(view);
  const ix = (px - before.x) / before.scale, iy = (py - before.y) / before.scale;
  const z = Math.min(Math.max(zoom, 1), CROP_MAX_ZOOM);
  const scale = (view.stage / Math.min(view.w, view.h)) * z;
  return fitCrop({ ...view, zoom: z, x: px - ix * scale, y: py - iy * scale });
}

/** Pedaço quadrado da imagem original que está dentro do quadro: { sx, sy, side } em pixels da imagem. */
export function cropSource(view) {
  const v = fitCrop(view);
  return { sx: -v.x / v.scale, sy: -v.y / v.scale, side: v.stage / v.scale };
}
