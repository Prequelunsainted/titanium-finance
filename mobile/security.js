// Bloqueio do app. Dois jeitos, que podem valer ao mesmo tempo:
//  1. Senha/biometria do celular: o navegador pede ao Android/iOS para confirmar que é você (digital,
//     rosto ou o PIN da tela de bloqueio) usando WebAuthn. O app nunca vê nem guarda essa senha.
//  2. PIN do app (4 a 8 dígitos), guardado só como hash PBKDF2 com sal.
// É uma trava de conveniência contra quem pega o celular desbloqueado: os dados continuam no
// armazenamento do navegador (sem criptografia), então o backup e a tela de bloqueio do celular
// seguem sendo o que realmente protege.

const encoder = new TextEncoder();

export const PIN_RE = /^\d{4,8}$/;
export const LOCK_TIMEOUTS = [[0, "Sempre que sair do app"], [1, "Após 1 minuto"], [5, "Após 5 minutos"], [15, "Após 15 minutos"]];

// ------------------------------------------------------------------ base64url

export function bytesToB64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64ToBytes(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ------------------------------------------------------------------------ PIN

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin) {
  if (!PIN_RE.test(pin)) throw new Error("O PIN deve ter de 4 a 8 números.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToB64(salt), hash: bytesToB64(await derive(pin, salt)) };
}

export async function verifyPin(pin, record) {
  if (!record || !PIN_RE.test(String(pin))) return false;
  const got = await derive(String(pin), b64ToBytes(record.salt)), want = b64ToBytes(record.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0;
}

/** Segundos de espera depois de erros seguidos: 0 até 4 erros, depois 30 s, 1 min, 2 min... até 15 min. */
export function lockoutSeconds(failures) {
  if (failures < 5) return 0;
  return Math.min(30 * 2 ** (failures - 5), 900);
}

// ----------------------------------------------------- senha/biometria do celular

export const deviceLockSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && !!window.PublicKeyCredential && !!navigator.credentials;

export async function deviceLockAvailable() {
  if (!deviceLockSupported()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

/** Cadastra a chave deste aparelho; o celular pede a digital, o rosto ou o PIN dele. Devolve o id da chave. */
export async function registerDeviceLock(displayName = "Titanium") {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Titanium Finance" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "titanium", displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      attestation: "none",
    },
  });
  if (!credential) throw new Error("O celular não confirmou o cadastro.");
  return bytesToB64(new Uint8Array(credential.rawId));
}

/** Pede ao celular para confirmar que é o dono. Resolve se confirmou; lança erro se cancelou ou falhou. */
export async function unlockWithDevice(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: b64ToBytes(credentialId) }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!assertion) throw new Error("O celular não confirmou.");
  return true;
}
