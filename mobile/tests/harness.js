// Mini framework de testes que roda igual no Node (CI) e no navegador (tests.html).
// Aceita testes síncronos e assíncronos (que devolvem uma Promise).

const results = [];
const pending = [];

export function test(name, fn) {
  const entry = { name, ok: true };
  results.push(entry);
  try {
    const out = fn();
    if (out && typeof out.then === "function") {
      pending.push(out.catch((error) => { entry.ok = false; entry.error = error.message; }));
    }
  } catch (error) {
    entry.ok = false;
    entry.error = error.message;
  }
}

export function assert(condition, message = "asserção falhou") {
  if (!condition) throw new Error(message);
}

export function equal(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(`${message} esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`.trim());
  }
}

export function deepEqual(actual, expected, message = "") {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} esperado ${e}, veio ${a}`.trim());
}

export function close(actual, expected, message = "", tolerance = 1e-9) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${message} esperado ${expected}, veio ${actual}`.trim());
}

export function throws(fn, ErrorType) {
  try {
    fn();
  } catch (error) {
    if (ErrorType && !(error instanceof ErrorType)) throw new Error(`erro inesperado: ${error}`);
    return;
  }
  throw new Error("deveria ter lançado um erro");
}

export async function report() {
  await Promise.all(pending);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : ` — ${r.error}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
  if (failed.length && globalThis.process) globalThis.process.exitCode = 1;
  return { results, failed: failed.length };
}
