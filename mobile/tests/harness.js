// Mini framework de testes que roda igual no Node (CI) e no navegador (tests.html).

const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
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

export function close(actual, expected, message = "") {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} esperado ${expected}, veio ${actual}`.trim());
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

export function report() {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : ` — ${r.error}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram`);
  if (failed.length && globalThis.process) globalThis.process.exitCode = 1;
  return { results, failed: failed.length };
}
