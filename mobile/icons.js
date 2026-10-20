// Ícones do app (SVG de traço, 24×24, cor = currentColor) e as cores de cada categoria e tipo.
// Nada de emoji: emoji muda de cara em cada celular; SVG fica igual em todo lugar.

const ring = (r1, r2, n, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i * 360) / n + offset) * (Math.PI / 180);
    const p = (r) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(r1)}L${p(r2)}`;
  }).join("");

const dot = (x, y, r = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const rect = (x, y, w, h, r = 2.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const circle = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const path = (...d) => d.map((x) => `<path d="${x}"/>`).join("");

const SHAPES = {
  home: path("M3 10.5 12 3l9 7.5", "M5 9.2V20h5v-6h4v6h5V9.2"),
  utensils: path("M7 3v7", "M4.5 3v4a2.5 2.5 0 0 0 5 0V3", "M7 10v11", "M17.5 3C15.6 4.2 15 7 15 9.5V14h2.5v7"),
  car: path("M4.5 16.5h15", "M4 16.5V13l1.7-4.6A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.9 1.4L20 13v3.5", "M5 16.5V19M19 16.5V19", "M4.5 12.5h15") + dot(8, 14.6, 1.1) + dot(16, 14.6, 1.1),
  heart: path("M12 20.3s-7.6-4.6-7.6-10.3A4.1 4.1 0 0 1 12 7.6 4.1 4.1 0 0 1 19.6 10c0 5.7-7.6 10.3-7.6 10.3z", "M7.5 12.5h2.4l1.4-2.3 1.9 4.4 1.4-2.1h1.9"),
  graduation: path("M2.5 9.5 12 5l9.5 4.5L12 14z", "M6.5 11.6V16c1.5 1.6 3.5 2.4 5.5 2.4s4-.8 5.5-2.4v-4.4", "M21.5 9.5V15"),
  gamepad: path("M7.5 8.5h9a4.5 4.5 0 0 1 4.4 5.4l-.5 2.4a2.4 2.4 0 0 1-4.2 1L14.6 15H9.4l-1.6 2.3a2.4 2.4 0 0 1-4.2-1l-.5-2.4A4.5 4.5 0 0 1 7.5 8.5z", "M8 10.8v3.4M6.3 12.5h3.4") + dot(15.6, 11.6, 1) + dot(17.6, 13.5, 1),
  laptop: rect(5, 5, 14, 10, 1.8) + path("M2.5 18.5h19"),
  card: rect(3, 5.5, 18, 13) + path("M3 10h18", "M7 14.5h4"),
  briefcase: rect(3, 7.5, 18, 12.5) + path("M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5", "M3 13h18"),
  trending: path("M3 17l6-6 4 4 7.5-7.5", "M14.5 7.5h6v6"),
  dots: dot(5.5, 12, 1.7) + dot(12, 12, 1.7) + dot(18.5, 12, 1.7),
  bank: path("M3 9.5 12 4l9 5.5", "M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5", "M3 20.5h18"),
  tag: path("M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.8 8.8a1.6 1.6 0 0 1 0 2.2l-6.5 6.5a1.6 1.6 0 0 1-2.2 0z") + dot(8, 8, 1.4),
  pix: path("M12 2.8 21.2 12 12 21.2 2.8 12z", "M8.4 12 12 8.4 15.6 12 12 15.6z"),
  cash: rect(2.5, 6, 19, 12) + circle(12, 12, 2.8) + dot(6, 9.5, 1) + dot(18, 14.5, 1),
  barcode: path("M4 5.5v13M7 5.5v13M10.5 5.5v13M13 5.5v13M16.5 5.5v13M20 5.5v13"),
  transfer: path("M4 8.5h14", "M15 5.5l3 3-3 3", "M20 15.5H6", "M9 12.5l-3 3 3 3"),
  user: circle(12, 8.5, 3.8) + path("M4.5 20.5c1.2-4 4.3-5.8 7.5-5.8s6.3 1.8 7.5 5.8"),
  gear: circle(12, 12, 3) + circle(12, 12, 6.6) + `<path d="${ring(6.6, 9.4, 8, 22.5)}" stroke-width="2.6"/>`,
  sun: circle(12, 12, 4) + `<path d="${ring(6.6, 9.2, 8)}"/>`,
  moon: path("M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"),
  monitor: rect(3, 4.5, 18, 12, 2) + path("M8.5 20.5h7M12 16.5v4"),
  lock: rect(5, 10.5, 14, 10) + path("M8 10.5V7.5a4 4 0 0 1 8 0v3", "M12 14.5v2.5"),
  layout: rect(3.5, 3.5, 7, 7, 1.6) + rect(13.5, 3.5, 7, 4.5, 1.6) + rect(13.5, 11, 7, 9.5, 1.6) + rect(3.5, 13.5, 7, 7, 1.6),
  scale: path("M12 4v16.5M7 20.5h10M5 7.5h14", "M2.5 13.5 5 7.5l2.5 6a2.5 2.5 0 0 1-5 0z", "M16.5 13.5 19 7.5l2.5 6a2.5 2.5 0 0 1-5 0z"),
  image: rect(3, 4.5, 18, 15) + circle(8.5, 9.5, 1.6) + path("M21 16l-5-5-9 8.5"),
  clipboard: rect(5.5, 4.5, 13, 16.5, 2) + path("M9 4.5V3.5h6v1", "M9 10h6M9 13.5h6M9 17h3.5"),
  repeat: path("M17 2.5l3 3-3 3", "M4 11.5v-1a5 5 0 0 1 5-5h11", "M7 21.5l-3-3 3-3", "M20 12.5v1a5 5 0 0 1-5 5H4"),
  calendar: rect(3.5, 5, 17, 15.5) + path("M8 3v4M16 3v4M3.5 10h17"),
  chevronLeft: path("M15 5.5 8.5 12l6.5 6.5"),
  chevronRight: path("M9 5.5l6.5 6.5L9 18.5"),
  arrowUp: path("M12 19V5", "M5.5 11.5 12 5l6.5 6.5"),
  arrowDown: path("M12 5v14", "M5.5 12.5 12 19l6.5-6.5"),
  plus: path("M12 5v14M5 12h14"),
  download: path("M12 4v11", "M7.5 10.5 12 15l4.5-4.5", "M4.5 19.5h15"),
  upload: path("M12 15V4", "M7.5 8.5 12 4l4.5 4.5", "M4.5 19.5h15"),
  phone: rect(7, 2.5, 10, 19, 2.5) + path("M11 18.5h2"),
  trash: path("M4 7h16", "M9.5 7V4.5h5V7", "M6.5 7l1 13h9l1-13"),
  sparkle: path("M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z", "M19 16v4M17 18h4"),
  alert: path("M12 4 21 19.5H3z", "M12 10v4.5") + dot(12, 17, 1.1),
  check: path("M5 12.5 10 17.5 19 7"),
  clock: circle(12, 12, 8.5) + path("M12 7.5V12l3 2"),
  wallet: path("M19.5 7.5V6a1.5 1.5 0 0 0-1.5-1.5H5.5A2 2 0 0 0 3.5 6.5v11A2 2 0 0 0 5.5 19.5h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6") + dot(16.5, 14, 1.2),
  pie: circle(12, 12, 9) + path("M12 3v9l6.4 6.4"),
  list: path("M8 6h13M8 12h13M8 18h13") + dot(3.8, 6, 1.1) + dot(3.8, 12, 1.1) + dot(3.8, 18, 1.1),
};

/** SVG de um ícone. `cls` vira a classe do <svg>. */
export function icon(name, cls = "i") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[name] ?? SHAPES.tag}</svg>`;
}

export const ICON_NAMES = Object.keys(SHAPES);

// --------------------------------------------------- categorias e tipos (cores)

const PALETTE = ["#2DD4BF", "#60A5FA", "#A78BFA", "#F472B6", "#F59E0B", "#34D399", "#FB923C", "#22D3EE", "#818CF8", "#F87171"];

const CATEGORY_META = {
  "Alimentação": ["utensils", "#F59E0B"],
  Moradia: ["home", "#60A5FA"],
  Transporte: ["car", "#A78BFA"],
  "Saúde": ["heart", "#F472B6"],
  "Educação": ["graduation", "#34D399"],
  Lazer: ["gamepad", "#FB923C"],
  Tecnologia: ["laptop", "#22D3EE"],
  "Cartão": ["card", "#F87171"],
  Trabalho: ["briefcase", "#2DD4BF"],
  Investimentos: ["trending", "#4ADE80"],
  Outros: ["dots", "#94A3B8"],
  Financiamento: ["bank", "#818CF8"],
};

// Categorias criadas pelo usuário ganham um ícone pelo significado do nome.
const CATEGORY_GUESS = [
  [/merc|comid|aliment|restaur|lanche|padar|ifood|delivery/i, "utensils", "#F59E0B"],
  [/casa|alug|morad|condom|luz|água|agua|gás|gas|energia/i, "home", "#60A5FA"],
  [/uber|carr|moto|combust|gasolin|ônibus|onibus|transp|estacion|pedágio|pedagio/i, "car", "#A78BFA"],
  [/farm|médic|medic|saúde|saude|hospital|dentist|academ|plano/i, "heart", "#F472B6"],
  [/curso|escol|faculd|educa|livro|estud/i, "graduation", "#34D399"],
  [/cinema|jogo|game|lazer|viag|show|bar|festa|stream/i, "gamepad", "#FB923C"],
  [/internet|celul|tecn|softw|assinat|app/i, "laptop", "#22D3EE"],
  [/cart[aã]o|fatura|crédito|credito/i, "card", "#F87171"],
  [/salár|salar|trabalh|freel|renda|venda|cliente/i, "briefcase", "#2DD4BF"],
  [/invest|poupan|reserva|ação|acoes|ações|cdb|tesouro/i, "trending", "#4ADE80"],
  [/financ|emprést|emprest|parcel|banco/i, "bank", "#818CF8"],
];

function hashColor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Ícone e cor de uma categoria (as conhecidas, as adivinhadas pelo nome e as demais). */
export function categoryMeta(name) {
  const known = CATEGORY_META[name];
  if (known) return { icon: known[0], color: known[1] };
  const guess = CATEGORY_GUESS.find(([re]) => re.test(name ?? ""));
  if (guess) return { icon: guess[1], color: guess[2] };
  return { icon: "tag", color: hashColor(name) };
}

const TYPE_META = {
  Pix: ["pix", "#2DD4BF"],
  Dinheiro: ["cash", "#4ADE80"],
  "Débito": ["card", "#60A5FA"],
  Boleto: ["barcode", "#F59E0B"],
  "Transferência": ["transfer", "#A78BFA"],
  "Cartão de crédito": ["card", "#F472B6"],
};

/** Ícone e cor de um "nome do tipo". Cartões cadastrados aparecem com o ícone de cartão. */
export function typeMeta(name, cardNames = []) {
  const known = TYPE_META[name];
  if (known) return { icon: known[0], color: known[1] };
  if (cardNames.includes(name) || /cart[aã]o|crédito|credito/i.test(name ?? "")) return { icon: "card", color: "#F472B6" };
  if (/pix/i.test(name ?? "")) return { icon: "pix", color: "#2DD4BF" };
  if (/vale|ticket|refei|aliment/i.test(name ?? "")) return { icon: "utensils", color: "#F59E0B" };
  return { icon: "tag", color: hashColor(name) };
}

/** Ícone dentro de um selo colorido (a cor vai na variável CSS --ic). */
export const badge = (meta, cls = "ibadge") => `<span class="${cls}" style="--ic:${meta.color}" aria-hidden="true">${icon(meta.icon)}</span>`;
