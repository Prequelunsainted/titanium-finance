// Tela de bloqueio: pede a senha/biometria do celular (WebAuthn) e/ou o PIN do app.
// A lógica de verificação fica em security.js; aqui só a tela e as regras de quando bloquear.

import { lockoutSeconds, unlockWithDevice, verifyPin } from "./security.js";
import { $ } from "./util.js";

const FAILS_KEY = "titanium.lockfails";

/**
 * app = { state (getter), ui, onUnlock(), wipeAll() }
 * Devolve { show, lockNow, enabled }.
 */
export function createLock(app) {
  const el = $("#lock"), pinForm = $("#lock-pin-form"), pinInput = $("#lock-pin"), msg = $("#lock-msg"), deviceBtn = $("#lock-device");
  const lockCfg = () => app.state.lock;
  const enabled = () => Boolean(lockCfg().device || lockCfg().pin);
  let hiddenAt = 0;

  const readFails = () => { try { return JSON.parse(localStorage.getItem(FAILS_KEY)) ?? { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
  const writeFails = (value) => { try { localStorage.setItem(FAILS_KEY, JSON.stringify(value)); } catch { /* sem armazenamento */ } };

  function show({ auto = true } = {}) {
    if (!enabled()) return;
    app.ui.locked = true;
    el.hidden = false;
    document.body.classList.add("locked");
    const name = app.state.profile.name;
    $("#lock-title").textContent = name ? `Olá, ${name}` : "Titanium bloqueado";
    $("#lock-sub").textContent = lockCfg().device ? "Confirme com a senha, digital ou rosto do celular." : "Digite o PIN do app para entrar.";
    deviceBtn.hidden = !lockCfg().device;
    pinForm.hidden = !lockCfg().pin;
    pinInput.value = "";
    msg.textContent = "";
    if (lockCfg().device && auto) setTimeout(tryDevice, 250);
    else if (lockCfg().pin) setTimeout(() => pinInput.focus(), 50);
  }

  function hide() {
    app.ui.locked = false;
    el.hidden = true;
    document.body.classList.remove("locked");
    writeFails({ n: 0, until: 0 });
    app.onUnlock?.();
  }

  async function tryDevice() {
    if (!app.ui.locked) return;
    try {
      await unlockWithDevice(lockCfg().device);
      hide();
    } catch (error) {
      msg.textContent = error?.name === "NotAllowedError"
        ? "Não foi confirmado. Toque em “Desbloquear com o celular” para tentar de novo."
        : "Não consegui confirmar com o celular. Tente de novo ou use o PIN.";
    }
  }

  deviceBtn.addEventListener("click", tryDevice);

  pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fails = readFails(), now = Date.now();
    if (now < fails.until) {
      msg.textContent = `Muitas tentativas. Aguarde ${Math.ceil((fails.until - now) / 1000)} s.`;
      return;
    }
    if (await verifyPin(pinInput.value, lockCfg().pin)) return hide();
    const n = fails.n + 1, wait = lockoutSeconds(n);
    writeFails({ n, until: wait ? now + wait * 1000 : 0 });
    pinInput.value = "";
    msg.textContent = wait ? `PIN incorreto. Aguarde ${wait} s para tentar de novo.` : `PIN incorreto. ${5 - n} tentativa${5 - n === 1 ? "" : "s"} antes de esperar.`;
  });

  $("#lock-forgot").addEventListener("click", () => {
    const ok = confirm("Esqueceu o acesso?\n\nA única saída é apagar TODOS os dados deste aparelho e começar do zero (você pode importar um backup depois).\n\nApagar tudo?");
    if (ok && prompt("Para confirmar, digite APAGAR") === "APAGAR") app.wipeAll();
  });

  // Ao sair do app e voltar, pede de novo conforme o tempo escolhido em Segurança.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    // Seletor de arquivos e menu de compartilhar tiram o app da tela por um instante: não conta como "sair".
    // (A marca expira sozinha, para não engolir uma saída de verdade.)
    if (Date.now() < app.ui.skipRelockUntil) { app.ui.skipRelockUntil = 0; hiddenAt = 0; return; }
    if (enabled() && !app.ui.locked && hiddenAt && Date.now() - hiddenAt >= lockCfg().timeout * 60_000) show();
  });

  return { show, lockNow: () => show({ auto: false }), enabled };
}
