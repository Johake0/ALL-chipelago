// Numeric env-var override with a real "is this set at all" check — plain
// `Number(process.env.X) || fallback` silently ignores an explicit
// override of 0 (e.g. FREE_REROLLS=0), since 0 is falsy in JS.
export function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}
