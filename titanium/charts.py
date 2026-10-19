"""Gráficos do painel (Matplotlib embutido no Tk), com dica ao passar o mouse."""

from __future__ import annotations

import tkinter as tk
from dataclasses import dataclass

import matplotlib

matplotlib.use("TkAgg")
from matplotlib import font_manager  # noqa: E402
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.ticker import FuncFormatter, MaxNLocator  # noqa: E402

from .core import MonthTotals, format_brl, format_compact  # noqa: E402

CATEGORY_COLORS = ("#22D3EE", "#A78BFA", "#F59E0B", "#F472B6", "#34D399", "#60A5FA", "#94A3B8")


def _pick_font() -> str:
    available = {f.name for f in font_manager.fontManager.ttflist}
    for family in ("Segoe UI", "Roboto", "Helvetica Neue", "Arial", "DejaVu Sans"):
        if family in available:
            return family
    return "sans-serif"


matplotlib.rcParams["font.family"] = _pick_font()


@dataclass(frozen=True)
class ChartPalette:
    card: str
    text: str
    muted: str
    grid: str
    income: str
    expense: str


class _Chart:
    def __init__(self, master: tk.Misc, height: float) -> None:
        self.figure = Figure(figsize=(5, height), dpi=100)
        self.canvas = FigureCanvasTkAgg(self.figure, master=master)
        self.widget = self.canvas.get_tk_widget()
        self.widget.configure(highlightthickness=0, borderwidth=0)
        self.canvas.mpl_connect("motion_notify_event", self._on_motion)
        self.canvas.mpl_connect("figure_leave_event", lambda _e: self._on_leave())
        self.palette: ChartPalette | None = None

    def _style(self, palette: ChartPalette) -> None:
        self.palette = palette
        self.figure.set_facecolor(palette.card)
        self.widget.configure(background=palette.card)

    def _on_motion(self, event) -> None:  # pragma: no cover - interação
        pass

    def _on_leave(self) -> None:  # pragma: no cover - interação
        pass


class FlowChart(_Chart):
    """Barras agrupadas de receitas x despesas por mês."""

    def __init__(self, master: tk.Misc) -> None:
        super().__init__(master, height=1.9)
        self.ax = self.figure.add_axes((0.08, 0.15, 0.9, 0.8))
        self.bars: list[tuple] = []
        self.tip = None

    def draw(self, series: list[MonthTotals], palette: ChartPalette) -> None:
        self._style(palette)
        ax = self.ax
        ax.clear()
        ax.set_facecolor(palette.card)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.tick_params(axis="both", length=0, colors=palette.muted, labelsize=9)
        self.bars = []

        if not any(m.income or m.expense for m in series):
            ax.set_xticks([])
            ax.set_yticks([])
            ax.text(0.5, 0.5, "Sem movimentações nos últimos meses", ha="center", va="center",
                    color=palette.muted, fontsize=10, transform=ax.transAxes)
            self.canvas.draw_idle()
            return

        width = 0.34
        last = len(series) - 1
        for i, month in enumerate(series):
            alpha = 1.0 if i == last else 0.5
            for offset, value, color, label in (
                (-width / 2 - 0.02, month.income, palette.income, "Receitas"),
                (width / 2 + 0.02, month.expense, palette.expense, "Despesas"),
            ):
                (bar,) = ax.bar(i + offset, value, width, color=color, alpha=alpha, zorder=3)
                self.bars.append((bar, month, label, value))

        ax.set_xticks(range(len(series)), [m.label for m in series])
        for i, tick in enumerate(ax.get_xticklabels()):
            if i == last:
                tick.set_color(palette.text)
                tick.set_fontweight("bold")
        ax.yaxis.set_major_locator(MaxNLocator(4))
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: format_compact(v, currency=False) if v else "0"))
        ax.grid(axis="y", color=palette.grid, linewidth=1, zorder=0)
        ax.set_xlim(-0.6, len(series) - 0.4)
        ax.set_ylim(0, max(max(m.income, m.expense) for m in series) * 1.15)

        self.tip = ax.annotate(
            "", xy=(0, 0), xytext=(0, 10), textcoords="offset points", ha="center", va="bottom",
            fontsize=9, color=palette.text, zorder=10,
            bbox=dict(boxstyle="round,pad=0.5", fc=palette.card, ec=palette.grid),
        )
        self.tip.set_visible(False)
        self.canvas.draw_idle()

    def _on_motion(self, event) -> None:  # pragma: no cover - interação
        if self.tip is None or event.inaxes is not self.ax:
            return self._on_leave()
        for bar, month, label, value in self.bars:
            if bar.contains(event)[0]:
                self.tip.xy = (bar.get_x() + bar.get_width() / 2, bar.get_height())
                self.tip.set_text(f"{label} em {month.label}\n{format_brl(value)}")
                self.tip.set_visible(True)
                self.canvas.draw_idle()
                return
        self._on_leave()

    def _on_leave(self) -> None:  # pragma: no cover - interação
        if self.tip is not None and self.tip.get_visible():
            self.tip.set_visible(False)
            self.canvas.draw_idle()


class DonutChart(_Chart):
    """Rosca de gastos por categoria; o centro mostra a fatia sob o mouse."""

    def __init__(self, master: tk.Misc) -> None:
        super().__init__(master, height=1.7)
        self.figure.set_size_inches(1.7, 1.7)
        self.ax = self.figure.add_axes((0.02, 0.02, 0.96, 0.96))
        self.wedges: list[tuple] = []
        self.total = 0.0
        self.center_title = self.center_value = None

    def draw(self, items: list[tuple[str, float]], palette: ChartPalette) -> None:
        self._style(palette)
        ax = self.ax
        ax.clear()
        ax.set_facecolor(palette.card)
        ax.set_aspect("equal")
        ax.axis("off")
        self.total = sum(v for _, v in items)
        self.wedges = []

        if self.total <= 0:
            ax.pie([1], colors=[palette.grid], startangle=90, wedgeprops=dict(width=0.28, edgecolor=palette.card))
            self.center_title = ax.text(0, 0.12, "Sem gastos", ha="center", va="center", color=palette.muted, fontsize=9)
            self.center_value = ax.text(0, -0.14, "no período", ha="center", va="center", color=palette.muted, fontsize=9)
            self.canvas.draw_idle()
            return

        wedges, _ = ax.pie(
            [v for _, v in items],
            colors=CATEGORY_COLORS[: len(items)],
            startangle=90,
            counterclock=False,
            wedgeprops=dict(width=0.28, edgecolor=palette.card, linewidth=2),
        )
        self.wedges = list(zip(wedges, items))
        self.center_title = ax.text(0, 0.14, "Total", ha="center", va="center", color=palette.muted, fontsize=9)
        label = format_compact(self.total)
        self.center_value = ax.text(0, -0.1, label, ha="center", va="center", color=palette.text,
                                    fontsize=12 if len(label) <= 9 else 10, fontweight="bold")
        self.canvas.draw_idle()

    def _on_motion(self, event) -> None:  # pragma: no cover - interação
        if not self.wedges or event.inaxes is not self.ax:
            return self._on_leave()
        for wedge, (name, value) in self.wedges:
            if wedge.contains(event)[0]:
                self._show_center(name, f"{value / self.total:.0%}", highlight=wedge)
                return
        self._on_leave()

    def _on_leave(self) -> None:  # pragma: no cover - interação
        if self.wedges and self.center_title is not None:
            self._show_center("Total", format_compact(self.total), highlight=None)

    def _show_center(self, title: str, value: str, highlight) -> None:  # pragma: no cover - interação
        if self.center_title.get_text() == title and self.center_value.get_text() == value:
            return
        self.center_title.set_text(title)
        self.center_value.set_text(value)
        for wedge, _ in self.wedges:
            wedge.set_alpha(1.0 if highlight is None or wedge is highlight else 0.35)
        self.canvas.draw_idle()
