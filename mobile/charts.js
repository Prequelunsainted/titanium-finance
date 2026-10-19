// Gráficos em SVG puro (sem bibliotecas), usados pelo painel.

import { formatCompact } from "./core.js";
import { esc } from "./util.js";

export const CATEGORY_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/** Barras de receitas x despesas por mês; toque numa barra seleciona o mês. */
export function flowChart(series, selected) {
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

/** Rosca de gastos por categoria (ou subcategoria). */
export function donut(slices, total) {
  if (!total) return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Sem gastos"><circle cx="21" cy="21" r="15.915" stroke="var(--track)"/><text class="center-1" x="21" y="21.5" text-anchor="middle">Sem gastos</text></svg>`;
  let offset = 25, svg = `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Gastos por categoria">`;
  slices.forEach(([, value], i) => {
    const pct = (value / total) * 100, gap = slices.length > 1 ? Math.min(0.8, pct / 2) : 0;
    svg += `<circle cx="21" cy="21" r="15.915" stroke="${CATEGORY_COLORS[i]}" stroke-dasharray="${pct - gap} ${100 - pct + gap}" stroke-dashoffset="${offset}"/>`;
    offset -= pct;
  });
  return svg + `<text class="center-1" x="21" y="19.5" text-anchor="middle">Total em R$</text><text class="center-2" x="21" y="25.5" text-anchor="middle">${esc(formatCompact(total, { currency: false }))}</text></svg>`;
}
