"""Interface gráfica do Titanium (CustomTkinter)."""

from __future__ import annotations

import tkinter as tk
from datetime import date, timedelta
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter import font as tkfont

import customtkinter as ctk
from PIL import ImageTk

from . import __version__
from .assets import icon_image, logo_image
from .charts import CATEGORY_COLORS, ChartPalette, DonutChart, FlowChart
from .core import (
    CATEGORIES,
    DEFAULT_CATEGORY,
    EXPENSE,
    INCOME,
    KINDS,
    PERIODS,
    Transaction,
    ValidationError,
    budget_statuses,
    comparison_label,
    describe_period,
    filter_transactions,
    format_brl,
    format_date,
    make_transaction,
    month_name,
    monthly_series,
    parse_amount,
    percent_change,
    period_range,
    previous_period,
    summarize,
    top_categories,
)
from .settings import Settings
from .storage import Storage, find_legacy_database

# Cores no formato (modo claro, modo escuro) — as mesmas variáveis do Figma.
BG = ("#F4F7F6", "#0A0F0E")
SIDEBAR = ("#E8F0EE", "#0F1715")
CARD = ("#FFFFFF", "#131C1A")
CARD_BORDER = ("#DCE7E3", "#1F2C29")
INPUT = ("#F4F7F6", "#0D1412")
SUBTLE = ("#E2EEEB", "#1A2725")
SUBTLE_HOVER = ("#D3E5E0", "#22332F")
TRACK = ("#DCE7E3", "#22302D")
TEXT = ("#10201C", "#E6F0ED")
MUTED = ("#5E716C", "#8A9C97")
ACCENT = ("#0D9488", "#2DD4BF")
ACCENT_HOVER = ("#0F766E", "#14B8A6")
ON_ACCENT = ("#FFFFFF", "#04201B")
INCOME_COLOR = ("#059669", "#34D399")
EXPENSE_COLOR = ("#DC2626", "#F87171")
WARNING = ("#D97706", "#FBBF24")
DANGER_SUBTLE = ("#FDECEC", "#2A1718")
DANGER_SUBTLE_HOVER = ("#FAD7D7", "#3A1D1F")

LEVEL_COLORS = {"ok": ACCENT, "alerta": WARNING, "estourado": EXPENSE_COLOR}
PAGES = ("Painel", "Movimentações", "Orçamentos")
PAGE_TITLES = {"Painel": "Visão geral", "Movimentações": "Movimentações", "Orçamentos": "Orçamentos"}
PAGE_ICONS = {"Painel": "◧", "Movimentações": "≡", "Orçamentos": "◔"}
APPEARANCES = ("Claro", "Escuro", "Sistema")
APPEARANCE_MODES = {"Claro": "light", "Escuro": "dark", "Sistema": "system"}
KIND_FILTERS = {"Todos": None, "Receitas": INCOME, "Despesas": EXPENSE}
ALL_CATEGORIES = "Todas as categorias"
RECENT_LIMIT = 4


def _pick_ui_font(root: tk.Misc) -> str:
    available = set(tkfont.families(root))
    for family in ("Segoe UI", "Roboto", "SF Pro Text", "Helvetica Neue", "DejaVu Sans"):
        if family in available:
            return family
    return "TkDefaultFont"


def _color(pair: tuple[str, str]) -> str:
    return pair[1] if ctk.get_appearance_mode() == "Dark" else pair[0]


class TitaniumApp(ctk.CTk):
    def __init__(self, storage: Storage | None = None, demo: bool = False) -> None:
        self.settings = Settings.load()
        ctk.set_appearance_mode(APPEARANCE_MODES.get(self.settings.appearance, "dark"))
        super().__init__(fg_color=BG)

        self.demo = demo
        self.title("Titanium Finance" + (" — demonstração" if demo else ""))
        self._center_window(1280, 840)
        self.minsize(1120, 760)

        self.ui_font = _pick_ui_font(self)
        self.storage = storage or Storage()
        self.transactions: list[Transaction] = []
        self.budgets: dict[str, float] = {}
        self.page = self.settings.page if self.settings.page in PAGES else PAGES[0]
        self._dirty: set[str] = set(PAGES)
        self._status_job: str | None = None
        self._search_job: str | None = None
        self._sort = ("date", True)
        self.dialog: TransactionDialog | None = None

        self.period_var = ctk.StringVar(value=self.settings.period)
        self.appearance_var = ctk.StringVar(
            value=self.settings.appearance if self.settings.appearance in APPEARANCES else "Escuro"
        )
        self.kind_filter_var = ctk.StringVar(value="Todos")
        self.category_filter_var = ctk.StringVar(value=ALL_CATEGORIES)

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._build_sidebar()
        self._build_main()
        self._style_table()
        self._bind_shortcuts()

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        # O CustomTkinter troca o ícone da janela ~200 ms após abrir no Windows.
        self.after(300, self._set_window_icon)

        imported = 0 if demo else self._import_legacy_if_needed()
        self.reload()
        self.show_page(self.page)
        if imported:
            self._set_status(f"{imported} movimentações importadas da versão anterior.", INCOME_COLOR)

    # ------------------------------------------------------------- construção

    def _font(self, size: int, weight: str = "normal") -> ctk.CTkFont:
        return ctk.CTkFont(family=self.ui_font, size=size, weight=weight)

    def _card(self, master: tk.Misc) -> ctk.CTkFrame:
        return ctk.CTkFrame(master, fg_color=CARD, border_color=CARD_BORDER, border_width=1, corner_radius=16)

    def _label(self, master: tk.Misc, text: str = "", size: int = 13, weight: str = "normal",
               color=TEXT, **kwargs) -> ctk.CTkLabel:
        return ctk.CTkLabel(master, text=text, font=self._font(size, weight), text_color=color, **kwargs)

    def _section_label(self, master: tk.Misc, text: str) -> ctk.CTkLabel:
        return self._label(master, text.upper(), 11, "bold", MUTED, anchor="w")

    def _primary_button(self, master: tk.Misc, text: str, command, **kwargs) -> ctk.CTkButton:
        options = dict(height=40, corner_radius=10, fg_color=ACCENT, hover_color=ACCENT_HOVER,
                       text_color=ON_ACCENT, font=self._font(14, "bold"))
        options.update(kwargs)
        return ctk.CTkButton(master, text=text, command=command, **options)

    def _secondary_button(self, master: tk.Misc, text: str, command, **kwargs) -> ctk.CTkButton:
        options = dict(height=36, corner_radius=10, fg_color=SUBTLE, hover_color=SUBTLE_HOVER,
                       text_color=TEXT, font=self._font(13, "bold"))
        options.update(kwargs)
        return ctk.CTkButton(master, text=text, command=command, **options)

    def _link_button(self, master: tk.Misc, text: str, command) -> ctk.CTkButton:
        return ctk.CTkButton(master, text=text, command=command, width=10, height=26, corner_radius=8,
                             fg_color="transparent", hover_color=SUBTLE, text_color=ACCENT,
                             font=self._font(13, "bold"))

    def _segmented(self, master: tk.Misc, **kwargs) -> ctk.CTkSegmentedButton:
        options = dict(selected_color=SUBTLE, selected_hover_color=SUBTLE_HOVER, unselected_color=CARD,
                       unselected_hover_color=SUBTLE, fg_color=CARD, text_color=TEXT,
                       font=self._font(13, "bold"), height=36, corner_radius=10)
        options.update(kwargs)
        return ctk.CTkSegmentedButton(master, **options)

    def _build_sidebar(self) -> None:
        bar = ctk.CTkFrame(self, width=248, corner_radius=0, fg_color=SIDEBAR)
        bar.grid(row=0, column=0, sticky="nsew")
        bar.grid_propagate(False)
        bar.grid_columnconfigure(0, weight=1)
        bar.grid_rowconfigure(3, weight=1)

        brand = ctk.CTkFrame(bar, fg_color="transparent")
        brand.grid(row=0, column=0, sticky="ew", padx=26, pady=(28, 26))
        self.logo = ctk.CTkImage(
            light_image=logo_image("#0D9488", "#FFFFFF"),
            dark_image=logo_image("#2DD4BF", "#04201B"),
            size=(44, 44),
        )
        ctk.CTkLabel(brand, image=self.logo, text="").pack(side="left")
        names = ctk.CTkFrame(brand, fg_color="transparent")
        names.pack(side="left", padx=(12, 0))
        self._label(names, "TITANIUM", 20, "bold", anchor="w").pack(anchor="w")
        self._label(names, "Finance", 12, color=MUTED, anchor="w").pack(anchor="w")

        self._section_label(bar, "Menu").grid(row=1, column=0, sticky="ew", padx=26, pady=(0, 6))
        nav = ctk.CTkFrame(bar, fg_color="transparent")
        nav.grid(row=2, column=0, sticky="ew", padx=16)
        self.nav_buttons: dict[str, ctk.CTkButton] = {}
        for i, page in enumerate(PAGES):
            button = ctk.CTkButton(
                nav, text=f"{PAGE_ICONS[page]}   {page}", anchor="w", height=40, corner_radius=10,
                fg_color="transparent", hover_color=SUBTLE, text_color=MUTED, font=self._font(14, "bold"),
                command=lambda p=page: self.show_page(p),
            )
            button.pack(fill="x", pady=2)
            self.nav_buttons[page] = button

        footer = ctk.CTkFrame(bar, fg_color="transparent")
        footer.grid(row=4, column=0, sticky="ew", padx=20, pady=(0, 22))
        tip = ctk.CTkFrame(footer, fg_color=SUBTLE, corner_radius=12)
        tip.pack(fill="x", pady=(0, 18))
        self._label(tip, "Atalho", 11, "bold", ACCENT, anchor="w").pack(fill="x", padx=14, pady=(10, 0))
        self._label(tip, "Ctrl+N cria uma nova movimentação em qualquer tela.", 12, color=MUTED,
                    anchor="w", justify="left", wraplength=180).pack(fill="x", padx=14, pady=(0, 10))
        self._section_label(footer, "Aparência").pack(fill="x", pady=(0, 6))
        self._segmented(
            footer, values=list(APPEARANCES), variable=self.appearance_var, command=self._on_appearance,
            font=self._font(12, "bold"), height=32, selected_color=ACCENT, selected_hover_color=ACCENT_HOVER,
        ).pack(fill="x")
        version = f"v{__version__}" + ("  ·  modo demonstração" if self.demo else "")
        self._label(footer, version, 11, color=MUTED, anchor="w").pack(fill="x", pady=(12, 0))

    def _build_main(self) -> None:
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.grid(row=0, column=1, sticky="nsew", padx=28, pady=(24, 12))
        main.grid_columnconfigure(0, weight=1)
        main.grid_rowconfigure(1, weight=1)

        header = ctk.CTkFrame(main, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", pady=(0, 18))
        heading = ctk.CTkFrame(header, fg_color="transparent")
        heading.pack(side="left")
        self.title_label = self._label(heading, "", 26, "bold", anchor="w")
        self.title_label.pack(anchor="w")
        self.subtitle_label = self._label(heading, "", 13, color=MUTED, anchor="w")
        self.subtitle_label.pack(anchor="w")
        self._primary_button(header, "+  Nova movimentação", self.new_transaction, width=190).pack(side="right")
        self.period_selector = self._segmented(
            header, values=list(PERIODS), variable=self.period_var, command=lambda _: self._on_period(),
            text_color=TEXT,
        )
        self.period_selector.pack(side="right", padx=(0, 12))

        self.pages_holder = ctk.CTkFrame(main, fg_color="transparent")
        self.pages_holder.grid(row=1, column=0, sticky="nsew")
        self.pages_holder.grid_columnconfigure(0, weight=1)
        self.pages_holder.grid_rowconfigure(0, weight=1)
        self.pages = {
            "Painel": self._build_dashboard(self.pages_holder),
            "Movimentações": self._build_transactions(self.pages_holder),
            "Orçamentos": self._build_budgets(self.pages_holder),
        }

        status = ctk.CTkFrame(main, fg_color="transparent")
        status.grid(row=2, column=0, sticky="ew", pady=(10, 0))
        self.status_label = self._label(status, "", 12, color=MUTED, anchor="w")
        self.status_label.pack(side="left")
        self._label(status, "Ctrl+N nova  ·  Ctrl+F buscar  ·  Ctrl+1/2/3 telas", 12, color=MUTED,
                    anchor="e").pack(side="right")

    # ----------------------------------------------------------------- painel

    def _build_dashboard(self, master: tk.Misc) -> ctk.CTkFrame:
        page = ctk.CTkFrame(master, fg_color="transparent")
        page.grid_columnconfigure(0, weight=3, uniform="dash")
        page.grid_columnconfigure(1, weight=2, uniform="dash")
        page.grid_rowconfigure(2, weight=1)

        kpis = ctk.CTkFrame(page, fg_color="transparent")
        kpis.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        kpis.grid_columnconfigure((0, 1, 2, 3), weight=1, uniform="kpi")
        self.kpis = {}
        for i, (key, icon, color, title) in enumerate(
            (("balance", "◎", ACCENT, "Saldo do período"), ("income", "↑", INCOME_COLOR, "Receitas"),
             ("expense", "↓", EXPENSE_COLOR, "Despesas"), ("savings", "%", WARNING, "Taxa de economia"))
        ):
            card = self._card(kpis)
            card.grid(row=0, column=i, sticky="ew", padx=(0 if i == 0 else 8, 0 if i == 3 else 8))
            top = ctk.CTkFrame(card, fg_color="transparent")
            top.pack(fill="x", padx=20, pady=(16, 6))
            ctk.CTkLabel(top, text=icon, width=32, height=32, corner_radius=10, fg_color=SUBTLE,
                         text_color=color, font=self._font(15, "bold")).pack(side="left")
            self._label(top, title, 13, color=MUTED).pack(side="left", padx=(10, 0))
            value = self._label(card, "R$ 0,00", 26, "bold", anchor="w")
            value.pack(fill="x", padx=20)
            delta = self._label(card, "", 12, color=MUTED, anchor="w")
            delta.pack(fill="x", padx=20, pady=(0, 14))
            self.kpis[key] = (value, delta)

        # Fluxo mensal
        flow = self._card(page)
        flow.grid(row=1, column=0, sticky="nsew", padx=(0, 8), pady=(0, 14))
        head = ctk.CTkFrame(flow, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(16, 0))
        titles = ctk.CTkFrame(head, fg_color="transparent")
        titles.pack(side="left")
        self._label(titles, "Receitas x despesas", 15, "bold", anchor="w").pack(anchor="w")
        self.flow_subtitle = self._label(titles, "", 12, color=MUTED, anchor="w")
        self.flow_subtitle.pack(anchor="w")
        for color, text in ((EXPENSE_COLOR, "Despesas"), (INCOME_COLOR, "Receitas")):
            self._label(head, text, 12, color=MUTED).pack(side="right", padx=(4, 0))
            self._label(head, "●", 12, color=color).pack(side="right", padx=(12, 0))
        holder = ctk.CTkFrame(flow, fg_color="transparent")
        holder.pack(fill="both", expand=True, padx=12, pady=(4, 12))
        self.flow_chart = FlowChart(holder)
        self.flow_chart.widget.pack(fill="both", expand=True)

        # Gastos por categoria
        cats = self._card(page)
        cats.grid(row=1, column=1, sticky="nsew", padx=(8, 0), pady=(0, 14))
        self._label(cats, "Gastos por categoria", 15, "bold", anchor="w").pack(fill="x", padx=20, pady=(16, 0))
        self.donut_subtitle = self._label(cats, "", 12, color=MUTED, anchor="w")
        self.donut_subtitle.pack(fill="x", padx=20)
        body = ctk.CTkFrame(cats, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=16, pady=(4, 12))
        donut_box = ctk.CTkFrame(body, fg_color="transparent", width=160, height=160)
        donut_box.pack(side="left")
        donut_box.pack_propagate(False)
        self.donut_chart = DonutChart(donut_box)
        self.donut_chart.widget.pack(fill="both", expand=True)
        self.legend = ctk.CTkFrame(body, fg_color="transparent")
        self.legend.pack(side="left", fill="both", expand=True, padx=(12, 0))

        # Movimentações recentes
        recent = self._card(page)
        recent.grid(row=2, column=0, sticky="nsew", padx=(0, 8))
        head = ctk.CTkFrame(recent, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(12, 4))
        self._label(head, "Movimentações recentes", 15, "bold").pack(side="left")
        self._link_button(head, "Ver todas →", lambda: self.show_page("Movimentações")).pack(side="right")
        self.recent_list = ctk.CTkFrame(recent, fg_color="transparent")
        self.recent_list.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        # Orçamentos
        budget = self._card(page)
        budget.grid(row=2, column=1, sticky="nsew", padx=(8, 0))
        head = ctk.CTkFrame(budget, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(12, 4))
        self._label(head, "Orçamentos do mês", 15, "bold").pack(side="left")
        self._link_button(head, "Editar", lambda: self.show_page("Orçamentos")).pack(side="right")
        self.budget_summary = ctk.CTkFrame(budget, fg_color="transparent")
        self.budget_summary.pack(fill="both", expand=True, padx=20, pady=(0, 14))
        return page

    def _render_dashboard(self) -> None:
        period = self._period()
        current = filter_transactions(self.transactions, period)
        summary = summarize(current)
        before = previous_period(period)
        previous = summarize(filter_transactions(self.transactions, before)) if before else None
        versus = comparison_label(period)

        def delta(key: str, now: float, then: float | None, lower_is_better: bool = False) -> None:
            label = self.kpis[key][1]
            change = percent_change(now, then) if then is not None else None
            if change is None:
                label.configure(text="sem comparação" if previous is None else "sem dados do período anterior",
                                text_color=MUTED)
                return
            good = (change <= 0) if lower_is_better else (change >= 0)
            label.configure(text=f"{'+' if change >= 0 else '−'}{abs(change):.0%} {versus}",
                            text_color=INCOME_COLOR if good else EXPENSE_COLOR)

        self.kpis["balance"][0].configure(text=format_brl(summary.balance),
                                          text_color=TEXT if summary.balance >= 0 else EXPENSE_COLOR)
        self.kpis["income"][0].configure(text=format_brl(summary.income))
        self.kpis["expense"][0].configure(text=format_brl(summary.expense))
        delta("balance", summary.balance, previous.balance if previous else None)
        delta("income", summary.income, previous.income if previous else None)
        delta("expense", summary.expense, previous.expense if previous else None, lower_is_better=True)
        rate = summary.savings_rate
        self.kpis["savings"][0].configure(text="—" if rate is None else f"{rate:.0%}",
                                          text_color=EXPENSE_COLOR if rate is not None and rate < 0 else TEXT)
        self.kpis["savings"][1].configure(
            text="sem receitas no período" if rate is None
            else "da renda guardada" if rate >= 0 else "gastou mais do que ganhou",
            text_color=MUTED,
        )

        months = 12 if period.name in ("Ano", "Tudo") else 6
        last_month = date.today() if period.end is None else min(period.end - timedelta(days=1), date.today())
        self.flow_subtitle.configure(text=f"Últimos {months} meses")
        palette = self._chart_palette()
        self.flow_chart.draw(monthly_series(self.transactions, last_month, months), palette)

        slices = top_categories(summary.by_category, 5)
        self.donut_subtitle.configure(text=f"Para onde foi o dinheiro · {describe_period(period).lower()}")
        self.donut_chart.draw(slices, palette)
        self._clear(self.legend)
        total = summary.expense or 1
        if not slices:
            self._label(self.legend, "Nenhuma despesa\nneste período.", 12, color=MUTED, justify="left",
                        anchor="w").pack(fill="x", pady=20)
        for i, (name, value) in enumerate(slices):
            row = ctk.CTkFrame(self.legend, fg_color="transparent")
            row.pack(fill="x", pady=1)
            ctk.CTkFrame(row, width=10, height=10, corner_radius=3, fg_color=CATEGORY_COLORS[i]).pack(side="left")
            self._label(row, name, 12, anchor="w").pack(side="left", padx=(8, 0))
            self._label(row, f"{value / total:.0%}", 12, "bold", MUTED).pack(side="right")

        self._render_recent(current[:RECENT_LIMIT])
        self._render_budget_summary()

    def _render_recent(self, items: list[Transaction]) -> None:
        self._clear(self.recent_list)
        if not items:
            empty = ctk.CTkFrame(self.recent_list, fg_color="transparent")
            empty.pack(expand=True)
            self._label(empty, "Nenhuma movimentação neste período.", 13, color=MUTED).pack(pady=(10, 8))
            self._secondary_button(empty, "Adicionar movimentação", self.new_transaction).pack()
            return
        for t in items:
            self._transaction_row(self.recent_list, t).pack(fill="x", pady=2)

    def _transaction_row(self, master: tk.Misc, t: Transaction) -> ctk.CTkFrame:
        row = ctk.CTkFrame(master, fg_color=INPUT, corner_radius=12, cursor="hand2")
        color = INCOME_COLOR if t.is_income else ACCENT
        badge = ctk.CTkLabel(row, text=("$" if t.is_income else t.category[:1].upper()), width=34, height=34,
                             corner_radius=17, fg_color=SUBTLE, text_color=color, font=self._font(14, "bold"))
        badge.pack(side="left", padx=(10, 12), pady=6)
        texts = ctk.CTkFrame(row, fg_color="transparent")
        texts.pack(side="left", fill="x", expand=True)
        self._label(texts, t.description, 14, anchor="w", height=19).pack(fill="x")
        self._label(texts, f"{t.category} · {format_date(t.date, short=True)}", 12, color=MUTED,
                    anchor="w", height=16).pack(fill="x")
        amount = self._label(row, format_brl(t.signed, signed=True), 14, "bold",
                             INCOME_COLOR if t.is_income else EXPENSE_COLOR)
        amount.pack(side="right", padx=14)
        for widget in (row, badge, texts, amount, *texts.winfo_children()):
            widget.bind("<Button-1>", lambda _e, tx=t: self.edit_transaction(tx))
        return row

    def _render_budget_summary(self) -> None:
        self._clear(self.budget_summary)
        statuses = budget_statuses(self.budgets, self._month_transactions())
        if not statuses:
            empty = ctk.CTkFrame(self.budget_summary, fg_color="transparent")
            empty.pack(expand=True)
            self._label(empty, "Defina limites mensais por categoria\npara acompanhar seus gastos.", 13,
                        color=MUTED, justify="center").pack(pady=(10, 8))
            self._secondary_button(empty, "Criar orçamento", lambda: self.show_page("Orçamentos")).pack()
            return
        for status in statuses[:4]:
            self._budget_bar(self.budget_summary, status).pack(fill="x", pady=4)

    def _budget_bar(self, master: tk.Misc, status) -> ctk.CTkFrame:
        box = ctk.CTkFrame(master, fg_color="transparent")
        top = ctk.CTkFrame(box, fg_color="transparent")
        top.pack(fill="x")
        self._label(top, status.category, 13, "bold", height=22).pack(side="left")
        over = status.level == "estourado"
        self._label(
            top,
            f"{format_brl(status.spent, cents=False)} de {format_brl(status.limit, cents=False)} · {status.ratio:.0%}",
            12, color=EXPENSE_COLOR if over else MUTED, height=22,
        ).pack(side="right")
        bar = ctk.CTkProgressBar(box, height=8, corner_radius=4, fg_color=TRACK,
                                 progress_color=LEVEL_COLORS[status.level])
        bar.pack(fill="x", pady=(4, 0))
        bar.set(min(status.ratio, 1))
        return box

    # ---------------------------------------------------------- movimentações

    def _build_transactions(self, master: tk.Misc) -> ctk.CTkFrame:
        page = ctk.CTkFrame(master, fg_color="transparent")
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(1, weight=1)

        bar = ctk.CTkFrame(page, fg_color="transparent")
        bar.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        self.search_entry = ctk.CTkEntry(
            bar, placeholder_text="Buscar descrição ou categoria…", width=300,
            height=36, corner_radius=10, fg_color=CARD, border_color=CARD_BORDER, text_color=TEXT,
            font=self._font(13),
        )
        self.search_entry.pack(side="left")
        self.search_entry.bind("<KeyRelease>", lambda _e: self._schedule_table_refresh())
        self._segmented(bar, values=list(KIND_FILTERS), variable=self.kind_filter_var,
                        command=lambda _: self._render_table()).pack(side="left", padx=(10, 0))
        self.category_menu = ctk.CTkOptionMenu(
            bar, variable=self.category_filter_var, values=[ALL_CATEGORIES], width=190, height=36,
            corner_radius=10, fg_color=CARD, button_color=CARD, button_hover_color=SUBTLE, text_color=TEXT,
            dropdown_fg_color=CARD, dropdown_hover_color=SUBTLE, dropdown_text_color=TEXT,
            font=self._font(13), dropdown_font=self._font(13), command=lambda _: self._render_table(),
        )
        self.category_menu.pack(side="left", padx=(10, 0))
        self._secondary_button(bar, "Exportar CSV", self.export_csv, width=120).pack(side="right")

        card = self._card(page)
        card.grid(row=1, column=0, sticky="nsew")
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(0, weight=1)
        columns = ("date", "description", "category", "kind", "amount")
        self.table = ttk.Treeview(card, columns=columns, show="headings", style="Titanium.Treeview",
                                  selectmode="browse")
        for col, text, width, anchor, stretch in (
            ("date", "Data", 110, "w", False), ("description", "Descrição", 320, "w", True),
            ("category", "Categoria", 170, "w", False), ("kind", "Tipo", 110, "w", False),
            ("amount", "Valor", 160, "e", False),
        ):
            self.table.heading(col, text=text, anchor=anchor, command=lambda c=col: self._sort_by(c))
            self.table.column(col, width=width, minwidth=80, anchor=anchor, stretch=stretch)
        self.table.grid(row=0, column=0, sticky="nsew", padx=(10, 0), pady=10)
        scroll = ctk.CTkScrollbar(card, command=self.table.yview, button_color=TRACK,
                                  button_hover_color=SUBTLE_HOVER)
        scroll.grid(row=0, column=1, sticky="ns", padx=(2, 6), pady=10)
        self.table.configure(yscrollcommand=scroll.set)
        self.table.bind("<Double-1>", lambda _e: self.edit_selected())
        self.table.bind("<Return>", lambda _e: self.edit_selected())
        self.table.bind("<Delete>", lambda _e: self.delete_selected())

        self.table_empty = self._label(card, "", 13, color=MUTED)

        footer = ctk.CTkFrame(page, fg_color="transparent")
        footer.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        self.table_summary = self._label(footer, "", 13, color=MUTED, anchor="w")
        self.table_summary.pack(side="left")
        self._secondary_button(
            footer, "Excluir", self.delete_selected, width=96, fg_color=DANGER_SUBTLE,
            hover_color=DANGER_SUBTLE_HOVER, text_color=EXPENSE_COLOR,
        ).pack(side="right")
        self._secondary_button(footer, "Editar", self.edit_selected, width=96).pack(side="right", padx=(0, 8))
        return page

    def _style_table(self) -> None:
        scale = self._get_window_scaling()
        style = ttk.Style(self)
        style.theme_use("default")
        card, text, muted = _color(CARD), _color(TEXT), _color(MUTED)
        style.configure("Titanium.Treeview", background=card, fieldbackground=card, foreground=text,
                        rowheight=int(36 * scale), borderwidth=0, relief="flat", font=(self.ui_font, 10))
        style.configure("Titanium.Treeview.Heading", background=card, foreground=muted, borderwidth=0,
                        relief="flat", font=(self.ui_font, 9, "bold"), padding=(6, int(8 * scale)))
        style.map("Titanium.Treeview", background=[("selected", _color(SUBTLE_HOVER))],
                  foreground=[("selected", text)])
        style.map("Titanium.Treeview.Heading", background=[("active", _color(SUBTLE))])
        style.layout("Titanium.Treeview", [("Treeview.treearea", {"sticky": "nswe"})])
        self.table.tag_configure("income", foreground=_color(INCOME_COLOR))
        self.table.tag_configure("expense", foreground=_color(TEXT))
        self.table.tag_configure("odd", background=_color(INPUT))

    def _table_rows(self) -> list[Transaction]:
        category = self.category_filter_var.get()
        rows = filter_transactions(
            self.transactions, self._period(), KIND_FILTERS[self.kind_filter_var.get()],
            None if category == ALL_CATEGORIES else category, self._search_text(),
        )
        key, descending = self._sort
        sorters = {
            "date": lambda t: (t.date, t.id or 0), "description": lambda t: t.description.casefold(),
            "category": lambda t: t.category.casefold(), "kind": lambda t: t.kind, "amount": lambda t: t.signed,
        }
        return sorted(rows, key=sorters[key], reverse=descending)

    def _render_table(self) -> None:
        self._search_job = None
        categories = sorted({t.category for t in self.transactions} | set(CATEGORIES))
        self.category_menu.configure(values=[ALL_CATEGORIES, *categories])
        if self.category_filter_var.get() not in (ALL_CATEGORIES, *categories):
            self.category_filter_var.set(ALL_CATEGORIES)

        rows = self._table_rows()
        self.table.delete(*self.table.get_children())
        for i, t in enumerate(rows):
            tags = ("income" if t.is_income else "expense",) + (("odd",) if i % 2 else ())
            self.table.insert("", "end", iid=str(t.id), tags=tags, values=(
                format_date(t.date), t.description, t.category, t.kind, format_brl(t.signed, signed=True)))

        for col, text in (("date", "Data"), ("description", "Descrição"), ("category", "Categoria"),
                          ("kind", "Tipo"), ("amount", "Valor")):
            arrow = (" ↓" if self._sort[1] else " ↑") if self._sort[0] == col else ""
            self.table.heading(col, text=text + arrow)

        if rows:
            self.table_empty.place_forget()
        else:
            filtered = bool(self._search_text().strip()) or self.kind_filter_var.get() != "Todos" \
                or self.category_filter_var.get() != ALL_CATEGORIES
            self.table_empty.configure(text="Nada encontrado com esses filtros." if filtered
                                       else "Nenhuma movimentação neste período. Use “Nova movimentação”.")
            self.table_empty.place(relx=0.5, rely=0.5, anchor="center")

        s = summarize(rows)
        self.table_summary.configure(
            text=f"{s.count} {'movimentação' if s.count == 1 else 'movimentações'}  ·  "
                 f"Receitas {format_brl(s.income)}  ·  Despesas {format_brl(s.expense)}  ·  "
                 f"Saldo {format_brl(s.balance)}"
        )

    def _sort_by(self, column: str) -> None:
        key, descending = self._sort
        self._sort = (column, not descending if key == column else column in ("date", "amount"))
        self._render_table()

    def _search_text(self) -> str:
        # O CTkEntry devolve o placeholder quando está vazio e sem foco.
        return "" if self.search_entry._placeholder_text_active else self.search_entry.get()

    def _schedule_table_refresh(self) -> None:
        if self._search_job:
            self.after_cancel(self._search_job)
        self._search_job = self.after(150, self._render_table)

    def _selected_transaction(self) -> Transaction | None:
        selection = self.table.selection()
        if not selection:
            self._set_status("Selecione uma movimentação na tabela.", WARNING)
            return None
        return next((t for t in self.transactions if str(t.id) == selection[0]), None)

    # -------------------------------------------------------------- orçamentos

    def _build_budgets(self, master: tk.Misc) -> ctk.CTkFrame:
        page = ctk.CTkFrame(master, fg_color="transparent")
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(1, weight=1)

        intro = self._card(page)
        intro.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        self.budget_overview = self._label(intro, "", 14, "bold", anchor="w")
        self.budget_overview.pack(fill="x", padx=20, pady=(14, 0))
        self._label(intro, "Digite um limite mensal e pressione Enter. Deixe em branco para remover. "
                           "Fica amarelo a partir de 90% e vermelho quando passa do limite.",
                    12, color=MUTED, anchor="w").pack(fill="x", padx=20, pady=(0, 14))

        self.budget_grid = ctk.CTkScrollableFrame(page, fg_color="transparent", scrollbar_button_color=TRACK,
                                                  scrollbar_button_hover_color=SUBTLE_HOVER)
        self.budget_grid.grid(row=1, column=0, sticky="nsew")
        self.budget_grid.grid_columnconfigure((0, 1), weight=1, uniform="budget")
        return page

    def _render_budgets(self) -> None:
        self._clear(self.budget_grid)
        month = self._month_transactions()
        spent = dict(summarize(month).by_category)
        expense_categories = {t.category for t in self.transactions if not t.is_income}
        names = sorted((set(CATEGORIES) - {"Trabalho"}) | expense_categories | set(self.budgets),
                       key=lambda c: (-spent.get(c, 0), c))
        total_limit = sum(self.budgets.values())
        total_spent = sum(spent.get(c, 0) for c in self.budgets)
        self.budget_overview.configure(
            text=f"{format_brl(total_spent)} gastos de {format_brl(total_limit)} planejados em "
                 f"{month_name(date.today())}" if self.budgets else "Nenhum orçamento definido ainda"
        )
        statuses = {s.category: s for s in budget_statuses(self.budgets, month)}
        for i, name in enumerate(names):
            self._budget_card(self.budget_grid, name, spent.get(name, 0.0), statuses.get(name)).grid(
                row=i // 2, column=i % 2, sticky="ew", padx=(0 if i % 2 == 0 else 6, 6 if i % 2 == 0 else 0),
                pady=6)

    def _budget_card(self, master: tk.Misc, name: str, spent: float, status) -> ctk.CTkFrame:
        card = self._card(master)
        top = ctk.CTkFrame(card, fg_color="transparent")
        top.pack(fill="x", padx=18, pady=(14, 6))
        texts = ctk.CTkFrame(top, fg_color="transparent")
        texts.pack(side="left", fill="x", expand=True)
        self._label(texts, name, 14, "bold", anchor="w").pack(fill="x")
        if status:
            detail = (f"Passou {format_brl(-status.remaining)} do limite" if status.level == "estourado"
                      else f"Restam {format_brl(status.remaining)} · {status.ratio:.0%} usado")
            color = EXPENSE_COLOR if status.level == "estourado" else WARNING if status.level == "alerta" else MUTED
        else:
            detail, color = f"Gasto no mês: {format_brl(spent)}", MUTED
        self._label(texts, detail, 12, color=color, anchor="w").pack(fill="x")

        entry = ctk.CTkEntry(top, width=120, height=34, corner_radius=10, placeholder_text="Sem limite",
                             fg_color=INPUT, border_color=CARD_BORDER, text_color=TEXT, font=self._font(13),
                             justify="right")
        entry.pack(side="right")
        self._label(top, "R$", 12, color=MUTED).pack(side="right", padx=(0, 6))
        if status:
            entry.insert(0, f"{status.limit:.2f}".replace(".", ","))
        entry.bind("<Return>", lambda _e: self._save_budget(name, entry))
        entry.bind("<FocusOut>", lambda _e: self._save_budget(name, entry, quiet=True))

        bar = ctk.CTkProgressBar(card, height=8, corner_radius=4, fg_color=TRACK,
                                 progress_color=LEVEL_COLORS[status.level] if status else TRACK)
        bar.pack(fill="x", padx=18, pady=(0, 16))
        bar.set(min(status.ratio, 1) if status else 0)
        return card

    def _save_budget(self, category: str, entry: ctk.CTkEntry, quiet: bool = False) -> None:
        text = entry.get().strip()
        current = self.budgets.get(category)
        try:
            value = parse_amount(text) if text else None
        except ValidationError as error:
            if not quiet:
                self._set_status(f"{category}: {error}", EXPENSE_COLOR)
            return
        if value == current:
            return
        self.storage.set_budget(category, value)
        self.budgets = self.storage.budgets()
        self._set_status(f"Orçamento de {category} {'removido' if value is None else 'salvo'}.", INCOME_COLOR)
        self._dirty |= {"Painel", "Orçamentos"}
        # Re-renderiza depois do evento atual para não destruir o campo durante o FocusOut.
        self.after(10, self._refresh_visible)

    # ------------------------------------------------------------- navegação

    def show_page(self, page: str) -> None:
        self.page = page
        self.pages[page].grid(row=0, column=0, sticky="nsew")
        for name, frame in self.pages.items():
            if name != page:
                frame.grid_remove()
        for name, button in self.nav_buttons.items():
            active = name == page
            button.configure(fg_color=SUBTLE if active else "transparent", text_color=TEXT if active else MUTED)
        self.title_label.configure(text=PAGE_TITLES[page])
        if page == "Orçamentos":
            self.period_selector.pack_forget()
        elif not self.period_selector.winfo_ismapped():
            self.period_selector.pack(side="right", padx=(0, 12))
        self._update_subtitle()
        self._dirty.add(page)
        self._refresh_visible()

    def _update_subtitle(self) -> None:
        if self.page == "Orçamentos":
            today = date.today()
            text = f"Limites mensais por categoria · {month_name(today)} de {today.year}"
        elif self.page == "Painel":
            text = f"{describe_period(self._period())} · seus números em um só lugar"
        else:
            text = f"{describe_period(self._period())} · clique duas vezes para editar"
        self.subtitle_label.configure(text=text)

    def reload(self) -> None:
        self.transactions = self.storage.all()
        self.budgets = self.storage.budgets()
        self._dirty = set(PAGES)
        self._refresh_visible()

    def _refresh_visible(self) -> None:
        if self.page not in self._dirty:
            return
        self._dirty.discard(self.page)
        {"Painel": self._render_dashboard, "Movimentações": self._render_table,
         "Orçamentos": self._render_budgets}[self.page]()

    def _period(self):
        return period_range(self.period_var.get())

    def _month_transactions(self) -> list[Transaction]:
        return filter_transactions(self.transactions, period_range("Mês"))

    def _bind_shortcuts(self) -> None:
        self.bind("<Control-n>", lambda _e: self.new_transaction())
        self.bind("<Control-N>", lambda _e: self.new_transaction())
        self.bind("<Control-f>", lambda _e: self._focus_search())
        self.bind("<Control-e>", lambda _e: self.export_csv())
        for i, page in enumerate(PAGES, start=1):
            self.bind(f"<Control-Key-{i}>", lambda _e, p=page: self.show_page(p))

    def _focus_search(self) -> None:
        self.show_page("Movimentações")
        self.search_entry.focus_set()

    def _center_window(self, width: int, height: int) -> None:
        # O Tk informa a tela em pixels lógicos, mas o CustomTkinter só escala o
        # tamanho da janela pelo DPI — a posição é aplicada em pixels físicos.
        scale = self._get_window_scaling()
        width = min(width, int(self.winfo_screenwidth() - 40))
        height = min(height, int(self.winfo_screenheight() - 100))
        x = max(0, int((self.winfo_screenwidth() - width) * scale / 2))
        y = max(0, int(((self.winfo_screenheight() - height) * scale - 80) / 2))
        self.geometry(f"{width}x{height}+{x}+{y}")

    def _set_window_icon(self) -> None:
        self._icon = ImageTk.PhotoImage(icon_image("#2DD4BF"))
        self.iconphoto(False, self._icon)

    # ----------------------------------------------------------------- eventos

    def _on_period(self) -> None:
        self._update_subtitle()
        self._dirty = set(PAGES)
        self._refresh_visible()
        self._save_settings()

    def _on_appearance(self, choice: str) -> None:
        ctk.set_appearance_mode(APPEARANCE_MODES[choice])
        self._save_settings()

    def _set_appearance_mode(self, mode_string: str) -> None:
        # Chamado pelo CustomTkinter sempre que o tema muda (inclusive pelo sistema).
        super()._set_appearance_mode(mode_string)
        if hasattr(self, "table"):
            self.after(20, self._on_theme_changed)

    def _on_theme_changed(self) -> None:
        self._style_table()
        self._dirty = set(PAGES)
        self._refresh_visible()

    def _save_settings(self) -> None:
        self.settings.appearance = self.appearance_var.get()
        self.settings.period = self.period_var.get()
        self.settings.page = self.page
        if not self.demo:
            self.settings.save()

    def _on_close(self) -> None:
        self._save_settings()
        self.destroy()

    def _import_legacy_if_needed(self) -> int:
        if self.storage.count():
            return 0
        legacy = find_legacy_database(Path.cwd(), Path(__file__).resolve().parent.parent)
        return self.storage.import_legacy(legacy) if legacy else 0

    # ------------------------------------------------------------------ ações

    def new_transaction(self) -> None:
        self._open_dialog(None)

    def edit_transaction(self, t: Transaction) -> None:
        self._open_dialog(t)

    def edit_selected(self) -> None:
        t = self._selected_transaction()
        if t:
            self.edit_transaction(t)

    def delete_selected(self) -> None:
        t = self._selected_transaction()
        if t:
            self.delete_transaction(t)

    def _open_dialog(self, t: Transaction | None) -> None:
        if self.dialog is not None and self.dialog.winfo_exists():
            self.dialog.focus_force()
            return
        self.dialog = TransactionDialog(self, t)

    def save_transaction(self, t: Transaction) -> None:
        if t.id is None:
            self.storage.add(t)
            self._set_status(f"“{t.description}” adicionada: {format_brl(t.signed, signed=True)}.", INCOME_COLOR)
        else:
            self.storage.update(t)
            self._set_status(f"“{t.description}” atualizada.", INCOME_COLOR)
        self.settings.last_kind = t.kind
        self.settings.last_category = t.category
        self._save_settings()
        self.reload()
        if self.page == "Movimentações" and t.id is not None and self.table.exists(str(t.id)):
            self.table.selection_set(str(t.id))
            self.table.see(str(t.id))

    def delete_transaction(self, t: Transaction) -> bool:
        if not messagebox.askyesno(
            "Excluir movimentação",
            f"Excluir “{t.description}” ({format_brl(t.signed, signed=True)}, {format_date(t.date)})?\n\n"
            "Essa ação não pode ser desfeita.",
            icon="warning", parent=self.dialog if self.dialog and self.dialog.winfo_exists() else self,
        ):
            return False
        self.storage.delete(t.id)
        self._set_status(f"“{t.description}” excluída.", MUTED)
        self.reload()
        return True

    def export_csv(self) -> None:
        rows = self._table_rows() if self.page == "Movimentações" else filter_transactions(
            self.transactions, self._period())
        if not rows:
            self._set_status("Não há movimentações para exportar neste período.", WARNING)
            return
        path = filedialog.asksaveasfilename(
            parent=self, title="Exportar relatório CSV", defaultextension=".csv",
            filetypes=[("Planilha CSV", "*.csv")],
            initialfile=f"titanium-{date.today():%Y-%m-%d}.csv",
        )
        if not path:
            return
        try:
            count = self.storage.export_csv(path, rows)
        except OSError as error:
            messagebox.showerror("Não foi possível exportar", str(error), parent=self)
            return
        self._set_status(f"{count} movimentações exportadas para {Path(path).name}.", INCOME_COLOR)

    # ------------------------------------------------------------ utilidades

    def _chart_palette(self) -> ChartPalette:
        return ChartPalette(card=_color(CARD), text=_color(TEXT), muted=_color(MUTED), grid=_color(TRACK),
                            income=_color(INCOME_COLOR), expense=_color(EXPENSE_COLOR))

    @staticmethod
    def _clear(frame: tk.Misc) -> None:
        for child in frame.winfo_children():
            child.destroy()

    def _set_status(self, message: str, color: tuple[str, str]) -> None:
        self.status_label.configure(text=message, text_color=color)
        if self._status_job:
            self.after_cancel(self._status_job)
        self._status_job = self.after(5000, lambda: self.status_label.configure(text=""))


class TransactionDialog(ctk.CTkToplevel):
    """Janela para criar ou editar uma movimentação."""

    def __init__(self, app: TitaniumApp, transaction: Transaction | None) -> None:
        super().__init__(app, fg_color=BG)
        self.app = app
        self.transaction = transaction
        editing = transaction is not None
        self.title("Editar movimentação" if editing else "Nova movimentação")
        self.resizable(False, False)
        self.transient(app)

        kind = transaction.kind if editing else app.settings.last_kind
        self.kind_var = ctk.StringVar(value=kind)
        self._category_touched = editing

        font = app._font
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=26, pady=24)

        app._label(body, "Editar movimentação" if editing else "Nova movimentação", 20, "bold",
                   anchor="w").pack(fill="x")
        app._label(body, "Enter salva · Esc fecha", 12, color=MUTED, anchor="w").pack(fill="x", pady=(0, 16))

        self.kind_selector = ctk.CTkSegmentedButton(
            body, values=list(KINDS), variable=self.kind_var, command=self._on_kind, height=38,
            corner_radius=10, fg_color=CARD, unselected_color=CARD, unselected_hover_color=SUBTLE,
            text_color=TEXT, font=font(14, "bold"),
        )
        self.kind_selector.pack(fill="x", pady=(0, 14))

        entry_opts = dict(height=40, corner_radius=10, fg_color=CARD, border_color=CARD_BORDER, text_color=TEXT,
                          font=font(14))
        self._field(body, "Descrição")
        self.description = ctk.CTkEntry(body, placeholder_text="Ex.: Supermercado", **entry_opts)
        self.description.pack(fill="x", pady=(0, 12))
        self.description.bind("<FocusOut>", lambda _e: self._suggest_from_history())

        row = ctk.CTkFrame(body, fg_color="transparent")
        row.pack(fill="x")
        row.grid_columnconfigure((0, 1), weight=1, uniform="row")
        left = ctk.CTkFrame(row, fg_color="transparent")
        left.grid(row=0, column=0, sticky="new", padx=(0, 6))
        right = ctk.CTkFrame(row, fg_color="transparent")
        right.grid(row=0, column=1, sticky="new", padx=(6, 0))
        self._field(left, "Valor (R$)")
        self.amount = ctk.CTkEntry(left, placeholder_text="0,00", **entry_opts)
        self.amount.pack(fill="x", pady=(0, 12))
        self._field(right, "Data")
        self.when = ctk.CTkEntry(right, placeholder_text="DD/MM/AAAA", **entry_opts)
        self.when.pack(fill="x")
        chips = ctk.CTkFrame(right, fg_color="transparent")
        chips.pack(fill="x", pady=(4, 8))
        for label, delta in (("Hoje", 0), ("Ontem", 1)):
            ctk.CTkButton(chips, text=label, width=56, height=24, corner_radius=8, fg_color=SUBTLE,
                          hover_color=SUBTLE_HOVER, text_color=TEXT, font=font(12),
                          command=lambda d=delta: self._set_date(date.today() - timedelta(days=d))).pack(
                side="left", padx=(0, 6))

        self._field(body, "Categoria")
        categories = sorted(set(CATEGORIES) | {t.category for t in app.transactions})
        self.category = ctk.CTkComboBox(
            body, values=categories, height=40, corner_radius=10, fg_color=CARD, border_color=CARD_BORDER,
            button_color=CARD_BORDER, button_hover_color=SUBTLE_HOVER, text_color=TEXT, font=font(14),
            dropdown_fg_color=CARD, dropdown_hover_color=SUBTLE, dropdown_text_color=TEXT,
            dropdown_font=font(13), command=lambda _: setattr(self, "_category_touched", True),
        )
        self.category.pack(fill="x")

        self.error = app._label(body, "", 12, color=EXPENSE_COLOR, anchor="w")
        self.error.pack(fill="x", pady=(10, 0))

        actions = ctk.CTkFrame(body, fg_color="transparent")
        actions.pack(fill="x", pady=(8, 0))
        app._primary_button(actions, "Salvar", self.save, width=120).pack(side="right")
        app._secondary_button(actions, "Cancelar", self.destroy, width=100, height=40).pack(side="right",
                                                                                            padx=(0, 8))
        if editing:
            app._secondary_button(actions, "Excluir", self._delete, width=90, height=40, fg_color=DANGER_SUBTLE,
                                  hover_color=DANGER_SUBTLE_HOVER, text_color=EXPENSE_COLOR).pack(side="left")

        if editing:
            self.description.insert(0, transaction.description)
            self.amount.insert(0, f"{transaction.amount:.2f}".replace(".", ","))
            self._set_date(transaction.date)
            self.category.set(transaction.category)
        else:
            self._set_date(date.today())
            self.category.set(app.settings.last_category if kind == app.settings.last_kind
                              else DEFAULT_CATEGORY[kind])
        self.category._entry.bind("<Key>", lambda _e: setattr(self, "_category_touched", True))
        self._paint_kind()

        self.bind("<Return>", lambda _e: self.save())
        self.bind("<KP_Enter>", lambda _e: self.save())
        self.bind("<Escape>", lambda _e: self.destroy())
        self._place_over(app, 460, 540)
        self.after(120, self._grab)
        # Mesmo truque da janela principal: o CustomTkinter troca o ícone depois de abrir.
        self.after(260, self._set_icon)

    def _set_icon(self) -> None:
        if self.winfo_exists() and getattr(self.app, "_icon", None):
            self.iconphoto(False, self.app._icon)

    def _field(self, master: tk.Misc, text: str) -> None:
        self.app._label(master, text, 12, "bold", MUTED, anchor="w").pack(fill="x", pady=(0, 4))

    def _place_over(self, app: TitaniumApp, width: int, height: int) -> None:
        app.update_idletasks()
        scale = self._get_window_scaling()
        x = app.winfo_rootx() + (app.winfo_width() - int(width * scale)) // 2
        y = app.winfo_rooty() + (app.winfo_height() - int(height * scale)) // 3
        self.geometry(f"{width}x{height}+{max(x, 0)}+{max(y, 0)}")

    def _grab(self) -> None:
        if not self.winfo_exists():
            return
        try:
            self.grab_set()
        except tk.TclError:
            pass
        self.lift()
        self.focus_force()
        (self.amount if self.transaction else self.description).focus_set()

    def _set_date(self, day: date) -> None:
        self.when.delete(0, "end")
        self.when.insert(0, format_date(day))

    def _on_kind(self, kind: str) -> None:
        if not self._category_touched:
            self.category.set(DEFAULT_CATEGORY[kind])
        self._paint_kind()

    def _paint_kind(self) -> None:
        color = INCOME_COLOR if self.kind_var.get() == INCOME else EXPENSE_COLOR
        self.kind_selector.configure(selected_color=color, selected_hover_color=color,
                                     text_color=TEXT, text_color_disabled=MUTED)
        # Texto escuro sobre o botão colorido para manter o contraste.
        self.kind_selector._buttons_dict[self.kind_var.get()].configure(text_color=ON_ACCENT)
        for kind, button in self.kind_selector._buttons_dict.items():
            if kind != self.kind_var.get():
                button.configure(text_color=TEXT)

    def _suggest_from_history(self) -> None:
        """Repete tipo e categoria da última vez que essa descrição foi usada."""
        if self.transaction is not None or self._category_touched:
            return
        typed = self.description.get().strip().casefold()
        match = next((t for t in self.app.transactions if t.description.casefold() == typed), None)
        if match:
            self.kind_var.set(match.kind)
            self.category.set(match.category)
            self._paint_kind()

    def save(self) -> None:
        try:
            t = make_transaction(
                self.description.get(), self.amount.get(), self.kind_var.get(), self.category.get(),
                self.when.get(), id=self.transaction.id if self.transaction else None,
            )
        except ValidationError as error:
            self.error.configure(text=str(error))
            return
        self.app.save_transaction(t)
        self.destroy()

    def _delete(self) -> None:
        if self.app.delete_transaction(self.transaction):
            self.destroy()


def run_app(storage: Storage | None = None, demo: bool = False) -> None:
    TitaniumApp(storage, demo=demo).mainloop()
