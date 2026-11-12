// Tiny test harness: node tests/run.js
const queue = [];
let failures = 0;

function test(name, fn) { queue.push({ name, fn }); }

function fail(msg) { throw new Error(msg); }
function ok(cond, msg) { if (!cond) fail(msg || 'expected a truthy value'); }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) fail((msg ? msg + ': ' : '') + 'expected ' + b + ' but got ' + a);
}
function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= (tol == null ? 0.01 : tol))) fail((msg ? msg + ': ' : '') + 'expected about ' + expected + ' but got ' + actual);
}
async function throwsAsync(fn, pattern, msg) {
  try { await fn(); } catch (e) { if (!pattern || pattern.test(String(e.message))) return e; fail((msg || 'wrong error') + ': ' + e.message); }
  fail(msg || 'expected an error');
}

async function run() {
  for (const t of queue) {
    try { await t.fn(); console.log('  ok    ' + t.name); }
    catch (e) { failures++; console.log('  FAIL  ' + t.name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e)); }
  }
  console.log('\n' + (queue.length - failures) + ' of ' + queue.length + ' passed');
  process.exit(failures ? 1 : 0);
}

module.exports = { test, ok, eq, near, throwsAsync, run };
