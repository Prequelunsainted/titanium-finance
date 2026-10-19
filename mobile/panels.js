// Telas auxiliares (folhas que sobem de baixo): perfil, segurança, cartões, tipos, saldo inicial,
// personalizar painel e financiamento. A tela principal fica em app.js.

import {
  DEFAULT_TYPES, FINANCING_SYSTEMS, ValidationError, compareSystems, financingSchedule, formatBrl, formatDate, makeFinancing,
  parseAmount, todayIso,
} from "./core.js";
import { PROFILE_COLORS } from "./store.js";
import { LOCK_TIMEOUTS, PIN_RE, deviceLockAvailable, hashPin, registerDeviceLock } from "./security.js";
import { $, esc, parseSigned } from "./util.js";

const SYSTEM_SHORT = { "sem-juros": "Sem juros", price: "Price", sac: "SAC" };
const SYSTEM_HINTS = {
  "sem-juros": "Divide o valor em parcelas iguais, sem juros (compra parcelada no cartão ou na loja).",
  price: "Parcela fixa do começo ao fim. Os juros pesam mais no início. É o mais comum em carros e motos.",
  sac: "Você amortiza o mesmo valor todo mês, então a parcela começa mais alta e diminui. Costuma pagar menos juros no total.",
};

export function createPanels(app) {
  const panel = $("#panel"), form = $("#panel-form");
  let submitFn = null, actions = {};

  /** Abre (ou troca o conteúdo da) folha. `submitFn` pode devolver false para manter a folha aberta. */
  function open({ title, body, submit = "Salvar", cancel = "Fechar", extra = "", submitFn: fn = null, actions: acts = {}, mount = null }) {
    $("#panel-title").textContent = title;
    $("#panel-body").innerHTML = body;
    $("#panel-error").textContent = "";
    $("#panel-actions").innerHTML = `${extra}<span class="spacer"></span><button type="button" class="btn" data-panel-close>${cancel}</button>${fn ? `<button type="submit" class="btn primary">${submit}</button>` : ""}`;
    submitFn = fn;
    actions = acts;
    if (!panel.open) panel.showModal();
    mount?.($("#panel-body"));
  }

  // Atualiza a tela de trás na hora (o evento "close" também faz isso, para o caso da tecla Esc).
  const close = () => { if (panel.open) { panel.close(); app.render({ keepScroll: true }); } };
  const fail = (message) => { $("#panel-error").textContent = message; };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if ((await submitFn?.()) !== false) close();
    } catch (error) {
      if (error instanceof ValidationError) fail(error.message); else throw error;
    }
  });
  panel.addEventListener("click", async (event) => {
    if (event.target === panel || event.target.closest("[data-panel-close]")) return close();
    const button = event.target.closest("[data-act]");
    if (button && actions[button.dataset.act]) {
      try { await actions[button.dataset.act](button); } catch (error) { if (error instanceof ValidationError) fail(error.message); else throw error; }
    }
  });
  panel.addEventListener("close", () => app.render({ keepScroll: true }));

  // ------------------------------------------------------------------ perfil

  function profile() {
    const p = app.state.profile;
    let color = p.color;
    open({
      title: "Seu perfil",
      body: `<label class="field"><span>Como devo te chamar?</span><input id="p-name" type="text" maxlength="40" value="${esc(p.name)}" placeholder="Seu nome" autocomplete="given-name"></label>
        <div class="field"><span>Cor do avatar</span><div class="swatches">${PROFILE_COLORS.map((c) => `<button type="button" class="swatch" data-act="color" data-color="${c}" style="background:${c}" aria-pressed="${c === color}" aria-label="Cor ${c}"></button>`).join("")}</div></div>
        <p class="hint">O nome aparece na saudação do painel e na tela de bloqueio. Tudo fica só neste aparelho: não existe conta nem login.</p>`,
      actions: { color: (b) => { color = b.dataset.color; panel.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s === b))); } },
      submitFn: () => {
        app.state.profile.name = $("#p-name").value.replace(/\s+/g, " ").trim().slice(0, 40);
        app.state.profile.color = color;
        app.persist();
        app.toast("Perfil salvo.");
      },
    });
  }

  // ---------------------------------------------------------------- segurança

  async function security(mode = null) {
    const lock = app.state.lock, deviceOk = await deviceLockAvailable(), anyLock = Boolean(lock.device || lock.pin);
    const body = `
      <section class="pcard"><b>Senha, digital ou rosto do celular</b>
        ${lock.device ? `<p class="hint ok">✓ Ativada: o app pede o mesmo desbloqueio do seu celular.</p><button type="button" class="btn" data-act="device-off">Desativar</button>`
          : deviceOk ? `<p class="hint">O app passa a pedir a mesma senha, digital ou rosto que desbloqueia o seu celular. O app nunca vê nem guarda essa senha: quem confirma é o próprio Android/iPhone.</p><button type="button" class="btn primary" data-act="device-on">Ativar com a senha do celular</button>`
          : `<p class="hint">${window.isSecureContext ? "Este aparelho ou navegador não oferece o desbloqueio do sistema para sites." : "Para usar a senha do celular, abra o app pelo endereço https (a versão publicada)."} Você ainda pode usar o PIN do app.</p>`}
      </section>
      <section class="pcard"><b>PIN do app</b>
        ${mode === "pin" ? `<label class="field"><span>Novo PIN (4 a 8 números)</span><input id="pin1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
            <label class="field"><span>Repita o PIN</span><input id="pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>`
          : lock.pin ? `<p class="hint ok">✓ PIN definido.</p><div class="menu"><button type="button" class="btn" data-act="pin-new">Alterar PIN</button><button type="button" class="btn danger" data-act="pin-off">Remover PIN</button></div>`
          : `<p class="hint">Um PIN só do app, independente do celular. Útil se o desbloqueio do sistema não estiver disponível.</p><button type="button" class="btn" data-act="pin-new">Definir PIN</button>`}
      </section>
      ${anyLock ? `<label class="field"><span>Pedir de novo</span><select id="lk-timeout">${LOCK_TIMEOUTS.map(([v, label]) => `<option value="${v}" ${v === lock.timeout ? "selected" : ""}>${label}</option>`).join("")}</select></label>` : ""}
      <p class="hint">Isto é uma trava contra quem pega o seu celular desbloqueado. Os dados continuam no armazenamento do navegador (sem criptografia): o que realmente protege é a tela de bloqueio do celular e o seu backup.</p>`;

    open({
      title: "Segurança e bloqueio", body,
      extra: anyLock ? `<button type="button" class="btn" data-act="lock-now">Bloquear agora</button>` : "",
      submit: "Salvar PIN",
      submitFn: mode === "pin" ? async () => {
        const a = $("#pin1").value, b = $("#pin2").value;
        if (!PIN_RE.test(a)) throw new ValidationError("O PIN deve ter de 4 a 8 números.");
        if (a !== b) throw new ValidationError("Os dois PINs não são iguais.");
        app.state.lock.pin = await hashPin(a);
        app.persist();
        app.toast("PIN salvo.");
        security();
        return false;
      } : null,
      actions: {
        "device-on": async () => {
          try {
            app.ui.skipRelockUntil = Date.now() + 20_000;
            app.state.lock.device = await registerDeviceLock(app.state.profile.name || "Titanium");
            app.persist();
            app.toast("Pronto! O app agora pede a senha do celular.");
          } catch (error) {
            fail(error?.name === "NotAllowedError" ? "O celular não confirmou. Tente de novo." : "Não consegui ativar neste aparelho.");
            return;
          }
          security();
        },
        "device-off": () => { if (confirm("Desativar o desbloqueio com a senha do celular?")) { app.state.lock.device = null; app.persist(); security(); } },
        "pin-new": () => security("pin"),
        "pin-off": () => { if (confirm("Remover o PIN do app?")) { app.state.lock.pin = null; app.persist(); security(); } },
        "lock-now": () => { close(); app.lockNow(); },
      },
      mount: () => $("#lk-timeout")?.addEventListener("change", (e) => { app.state.lock.timeout = Number(e.target.value); app.persist(); }),
    });
  }

  // ------------------------------------------------------------------ cartões

  function cards() {
    const list = app.state.cards;
    open({
      title: "Cartões de crédito",
      body: `${list.length ? `<ul class="plist">${list.map((c) => `<li><div><b>${esc(c.name)}</b><small>Limite ${formatBrl(c.limit, { cents: false })} · fecha dia ${c.closingDay}${c.dueDay ? ` · vence dia ${c.dueDay}` : ""}</small></div><button type="button" class="btn small" data-act="edit" data-name="${esc(c.name)}">Editar</button></li>`).join("")}</ul>`
        : `<p class="hint">Nenhum cartão cadastrado ainda.</p>`}
        <p class="hint">Ao lançar uma compra, escolha o nome do cartão em <b>Nome do tipo</b>: o limite disponível é calculado sozinho, a partir do fechamento da fatura.</p>`,
      extra: `<button type="button" class="btn" data-act="add">+ Novo cartão</button>`,
      actions: { add: () => cardForm(), edit: (b) => cardForm(b.dataset.name) },
    });
  }

  function cardForm(name = null) {
    const card = app.state.cards.find((c) => c.name === name);
    const day = (v, label) => {
      if (v === "" && label === "vencimento") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 31) throw new ValidationError(`O dia de ${label} deve ficar entre 1 e 31.`);
      return n;
    };
    open({
      title: card ? "Editar cartão" : "Novo cartão",
      body: `<label class="field"><span>Nome do cartão</span><input id="c-name" type="text" maxlength="40" placeholder="Ex.: Cartão Nubank" value="${esc(card?.name ?? "")}"></label>
        <label class="field"><span>Limite (R$)</span><input id="c-limit" type="text" inputmode="decimal" placeholder="0,00" value="${card ? card.limit.toFixed(2).replace(".", ",") : ""}"></label>
        <div class="row2"><label class="field"><span>Dia do fechamento</span><input id="c-close" type="number" min="1" max="31" inputmode="numeric" value="${card?.closingDay ?? ""}"></label>
        <label class="field"><span>Dia do vencimento</span><input id="c-due" type="number" min="1" max="31" inputmode="numeric" value="${card?.dueDay ?? ""}"></label></div>`,
      extra: card ? `<button type="button" class="btn danger" data-act="del">Excluir</button>` : "",
      actions: {
        del: () => {
          if (!confirm(`Excluir o cartão “${card.name}”?\n\nOs lançamentos continuam, só deixam de contar para o limite.`)) return;
          app.state.cards = app.state.cards.filter((c) => c !== card);
          app.persist();
          cards();
        },
      },
      submitFn: () => {
        const newName = $("#c-name").value.replace(/\s+/g, " ").trim().slice(0, 40);
        if (!newName) throw new ValidationError("Dê um nome ao cartão.");
        if (app.state.cards.some((c) => c.name === newName && c !== card)) throw new ValidationError("Já existe um cartão com esse nome.");
        const limit = parseAmount($("#c-limit").value);
        const closingDay = day($("#c-close").value, "fechamento"), dueDay = day($("#c-due").value, "vencimento");
        if (card) {
          // Quem renomeia o cartão leva junto os lançamentos que usavam o nome antigo.
          if (card.name !== newName) for (const t of app.state.transactions) if (t.type === card.name) t.type = newName;
          Object.assign(card, { name: newName, limit, closingDay, dueDay });
        } else {
          app.state.cards.push({ name: newName, limit, closingDay, dueDay });
        }
        app.persist();
        cards();
        return false;
      },
    });
  }

  // ------------------------------------------------------------------- tipos

  function types() {
    const defaultTypes = DEFAULT_TYPES, custom = app.state.types;
    open({
      title: "Tipos de lançamento",
      body: `<p class="hint">O “nome do tipo” diz como o dinheiro se moveu: Pix, boleto, cartão, dinheiro… Escolha ao lançar; dá para buscar e filtrar por ele.</p>
        <b class="plabel">Já inclusos</b><div class="chips wrap">${defaultTypes.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}${app.state.cards.map((c) => `<span class="pill">${esc(c.name)}</span>`).join("")}</div>
        <b class="plabel">Os seus</b>
        ${custom.length ? `<ul class="plist">${custom.map((t) => `<li><div><b>${esc(t)}</b></div><button type="button" class="btn small danger" data-act="remove" data-name="${esc(t)}">Remover</button></li>`).join("")}</ul>` : `<p class="hint">Você ainda não criou nenhum.</p>`}
        <label class="field"><span>Novo tipo</span><input id="t-new" type="text" maxlength="40" placeholder="Ex.: Vale-refeição, Pix Itaú"></label>`,
      extra: `<button type="button" class="btn" data-act="add">Adicionar</button>`,
      actions: {
        add: () => {
          const name = $("#t-new").value.replace(/\s+/g, " ").trim().slice(0, 40);
          if (!name) return fail("Digite o nome do novo tipo.");
          if ([...defaultTypes, ...app.state.types, ...app.state.cards.map((c) => c.name)].some((t) => t.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return fail("Esse tipo já existe.");
          app.state.types.push(name);
          app.persist();
          types();
        },
        remove: (b) => { app.state.types = app.state.types.filter((t) => t !== b.dataset.name); app.persist(); types(); },
      },
    });
  }

  // ------------------------------------------------------------- saldo inicial

  function opening() {
    open({
      title: "Saldo inicial",
      body: `<p class="hint">Quanto você tinha na conta <b>antes</b> do primeiro lançamento do app. Com isso, o “saldo do dia” da lista bate com o do seu banco.</p>
        <label class="field"><span>Saldo inicial (R$)</span><input id="o-val" type="text" inputmode="decimal" placeholder="0,00" value="${app.state.settings.openingBalance ? String(app.state.settings.openingBalance.toFixed(2)).replace(".", ",") : ""}"></label>
        <p class="hint">Pode ser negativo (use o sinal de menos). O saldo é sempre calculado na hora a partir dos lançamentos, nunca guardado: se você corrigir um lançamento antigo, tudo se acerta sozinho.</p>`,
      submitFn: () => {
        app.state.settings.openingBalance = parseSigned($("#o-val").value, parseAmount);
        app.persist();
        app.toast("Saldo inicial salvo.");
      },
    });
  }

  // ----------------------------------------------------- personalizar painel

  function customize() {
    const list = app.widgetList();
    open({
      title: "Personalizar painel",
      cancel: "Concluído",
      body: `<p class="hint">Mostre só o que importa para você e mude a ordem. Os blocos escondidos podem voltar a qualquer momento.</p>
        <ul class="wlist">${list.map((w, i) => `<li><label class="switch"><input type="checkbox" data-wtoggle="${w.id}" ${w.visible ? "checked" : ""}><span>${esc(w.title)}</span></label>
          <span class="wmove"><button type="button" data-act="up" data-id="${w.id}" ${i === 0 ? "disabled" : ""} aria-label="Subir ${esc(w.title)}">↑</button><button type="button" data-act="down" data-id="${w.id}" ${i === list.length - 1 ? "disabled" : ""} aria-label="Descer ${esc(w.title)}">↓</button></span></li>`).join("")}</ul>`,
      extra: `<button type="button" class="btn" data-act="reset">Restaurar padrão</button>`,
      actions: {
        up: (b) => { app.moveWidget(b.dataset.id, -1); customize(); },
        down: (b) => { app.moveWidget(b.dataset.id, 1); customize(); },
        reset: () => { app.resetDashboard(); app.toast("Painel restaurado ao padrão."); customize(); },
      },
      mount: (root) => root.querySelectorAll("[data-wtoggle]").forEach((box) => box.addEventListener("change", () => app.toggleWidget(box.dataset.wtoggle, box.checked))),
    });
  }

  // ------------------------------------------------------------ financiamento

  function financing(id = null) {
    const t = id === null ? null : app.state.transactions.find((x) => x.id === id && x.plan);
    const plan = t?.plan, today = todayIso();
    const cats = [...new Set(["Financiamento", ...app.categories()])];
    const types = app.allTypes();
    const rateText = plan ? String(plan.rate).replace(".", ",") : "";
    const read = () => ({
      description: $("#fn-name").value, principal: $("#fn-principal").value, entry: $("#fn-entry").value,
      rate: $("#fn-rate").value, rateUnit: $("#fn-unit").value, count: $("#fn-count").value,
      system: panel.querySelector('input[name="fsys"]:checked').value, when: $("#fn-date").value,
      category: $("#fn-cat").value, type: $("#fn-type").value,
    });

    function preview() {
      const box = $("#fn-preview");
      $("#fn-sys-hint").textContent = SYSTEM_HINTS[panel.querySelector('input[name="fsys"]:checked').value];
      $("#fn-rate-wrap").hidden = panel.querySelector('input[name="fsys"]:checked').value === "sem-juros";
      let f;
      try { f = makeFinancing(read(), today); } catch (error) {
        box.innerHTML = `<p class="hint">${error instanceof ValidationError ? esc(error.message) : "Preencha os campos para simular."}</p>`;
        return;
      }
      const rows = financingSchedule(f.plan, f.date), total = rows.reduce((a, r) => a + r.payment, 0), interest = rows.reduce((a, r) => a + r.interest, 0);
      const parcela = f.plan.system === "sac" ? `de ${formatBrl(rows[0].payment)} até ${formatBrl(rows.at(-1).payment)}` : formatBrl(rows[0].payment);
      let compare = "";
      if (f.plan.system !== "sem-juros" && f.plan.rate > 0) {
        const c = compareSystems(f.plan.principal, f.plan.rate, f.plan.count, f.date), other = f.plan.system === "price" ? "sac" : "price";
        compare = `<p class="hint">Em ${other === "sac" ? "SAC" : "Price"}: ${other === "sac" ? `parcelas de ${formatBrl(c.sac.first)} a ${formatBrl(c.sac.last)}` : `parcela fixa de ${formatBrl(c.price.first)}`}, juros de ${formatBrl(c[other].interest)}.</p>`;
      }
      box.innerHTML = `<div class="trio"><div><span class="label">Parcela</span><b>${parcela}</b></div><div><span class="label">Total a pagar</span><b>${formatBrl(total, { cents: false })}</b></div><div><span class="label">Juros</span><b class="out">${formatBrl(interest, { cents: false })}</b></div></div>
        <p class="hint">${f.plan.count}x · última parcela em ${formatDate(rows.at(-1).date)}${f.plan.entry ? ` · com a entrada, o bem custa ${formatBrl(f.plan.entry + f.plan.principal)}` : ""}</p>${compare}`;
    }

    open({
      title: t ? "Editar financiamento" : "Novo financiamento",
      submit: "Salvar",
      body: `<label class="field"><span>Nome</span><input id="fn-name" type="text" maxlength="60" placeholder="Ex.: Moto, Carro, Geladeira" value="${esc(t?.description ?? "")}"></label>
        <div class="seg fsys" role="radiogroup" aria-label="Sistema">${Object.entries(FINANCING_SYSTEMS).map(([k, label]) => `<label><input type="radio" name="fsys" value="${k}" ${(plan?.system ?? "price") === k ? "checked" : ""}><span>${esc(SYSTEM_SHORT[k] ?? label)}</span></label>`).join("")}</div>
        <p class="hint" id="fn-sys-hint"></p>
        <div class="row2"><label class="field"><span>Valor financiado (R$)</span><input id="fn-principal" type="text" inputmode="decimal" placeholder="0,00" value="${plan ? plan.principal.toFixed(2).replace(".", ",") : ""}"></label>
        <label class="field"><span>Entrada (R$, opcional)</span><input id="fn-entry" type="text" inputmode="decimal" placeholder="0,00" value="${plan?.entry ? plan.entry.toFixed(2).replace(".", ",") : ""}"></label></div>
        <div class="row2"><label class="field"><span>Parcelas</span><input id="fn-count" type="number" min="1" max="480" inputmode="numeric" value="${plan?.count ?? ""}"></label>
        <label class="field"><span>1º vencimento</span><input id="fn-date" type="date" value="${t?.date ?? today}"></label></div>
        <div class="field" id="fn-rate-wrap"><span>Juros</span><div class="inline"><input id="fn-rate" type="text" inputmode="decimal" placeholder="Ex.: 1,5" value="${rateText}"><select id="fn-unit" aria-label="Unidade dos juros"><option value="mes">% ao mês</option><option value="ano">% ao ano</option></select></div></div>
        <div class="row2"><label class="field"><span>Categoria</span><select id="fn-cat">${cats.map((c) => `<option ${c === (t?.category ?? "Financiamento") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="field"><span>Nome do tipo</span><select id="fn-type"><option value="">— nenhum —</option>${types.map((x) => `<option ${x === t?.type ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
        <div class="preview" id="fn-preview"></div>`,
      extra: t ? `<button type="button" class="btn danger" data-act="del">Excluir</button>` : "",
      actions: {
        del: () => {
          if (!confirm(`Excluir o financiamento “${t.description}”?\n\nAs parcelas somem de todos os meses.`)) return;
          app.withUndo(() => { app.state.transactions = app.state.transactions.filter((x) => x.id !== t.id); }, "Financiamento excluído.");
          close();
        },
      },
      submitFn: () => {
        const nf = makeFinancing(read(), today);
        if (t) Object.assign(t, nf); else app.addTransactions([nf]);
        app.persist();
        app.toast(t ? "Financiamento atualizado." : "Financiamento salvo.");
      },
      mount: (root) => {
        root.addEventListener("input", preview);
        root.addEventListener("change", preview);
        preview();
      },
    });
  }

  return { open, close, profile, security, cards, cardForm, types, opening, customize, financing };
}
