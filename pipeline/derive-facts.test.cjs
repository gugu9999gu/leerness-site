'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'derive-facts.cjs'), 'utf8');
const scenarios = [
  ['passed', { status: 0, stdout: '{"ok":true,"total":2}', stderr: '' }, true, null],
  ['nonzero', { status: 1, stdout: '{"ok":true,"total":2}' }, false, 'process_failed'],
  ['timeout', { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '' }, false, 'timeout'],
  ['signal', { status: null, signal: 'SIGTERM', stdout: '' }, false, 'signal'],
  ['spawn', { status: null, error: { code: 'ENOENT' } }, false, 'spawn_error'],
  ['invalid-json', { status: 0, stdout: '{' }, false, 'invalid_json'],
  ['failed-suite', { status: 0, stdout: '{"ok":false,"total":2}' }, false, 'invalid_result'],
  ['invalid-count', { status: 0, stdout: '{"ok":true,"total":-2}' }, false, 'invalid_result'],
  ['numeric-string', { status: 0, stdout: '{"ok":true,"total":"2"}' }, false, 'invalid_result'],
  ['missing-ok', { status: 0, stdout: '{"total":2}' }, false, 'invalid_result'],
  ['secret-output', { status: 2, stdout: 'synthetic-private-value', stderr: 'synthetic-private-value' }, false, 'process_failed'],
];
let passed = 0;
for (const [name, child, expected, code] of scenarios) {
  let result;
  const tools = [{ name: 'tool' }]; tools.CORE = ['tool'];
  const fakeFs = {
    readFileSync: () => '{"version":"1.0.0","dependencies":{}}',
    mkdirSync: () => {},
    writeFileSync: (_file, text) => { result = JSON.parse(text); },
  };
  const fakeCp = { spawnSync: (_exe, args, opts) => {
    assert.deepEqual(Array.from(args).slice(-2), ['selftest', '--json']);
    assert.equal(opts.timeout, 180000);
    return child;
  } };
  // 실제 CLI 배선을 실행하되 fixture I/O와 child 결과만 결정적으로 주입한다.
  const load = id => {
    if (id === 'fs') return fakeFs;
    if (id === 'path') return path;
    if (id === 'child_process') return fakeCp;
    if (id === './selftest-metric.cjs') return require(id);
    if (id.endsWith('mcp-tools.js')) return tools;
    throw new Error('Unexpected dependency: ' + id);
  };
  vm.runInNewContext(source, {
    require: load, __dirname,
    process: { argv: ['node', 'derive-facts'], execPath: process.execPath, cwd: () => __dirname, exit: code => { throw Error('exit ' + code); } },
    console: { log() {}, error() {} },
  });
  try {
    assert.equal(result.measured.selftestCases === 2, expected);
    if (!expected) {
      const failure = result.unmeasured.find(x => x.key === 'selftestCases');
      assert.equal(failure.observation.reasonCode, code);
      assert.equal(failure.observation.status, child.status);
      assert.equal(failure.observation.signal, child.signal || null);
      assert.equal(failure.observation.errorCode, child.error?.code || null);
      assert.equal(failure.observation.stdoutBytes, Buffer.byteLength(child.stdout || ''));
      assert.equal(failure.observation.stderrBytes, Buffer.byteLength(child.stderr || ''));
      assert(Number.isFinite(failure.observation.elapsedMs));
      assert(!JSON.stringify(result).includes('synthetic-private-value'));
    }
    passed++; console.log('PASS ' + name);
  } catch (err) { console.error('FAIL ' + name + ': ' + err.message); }
}
console.log(`derive-facts: ${passed}/${scenarios.length} passed`);
if (passed !== scenarios.length) process.exitCode = 1;
