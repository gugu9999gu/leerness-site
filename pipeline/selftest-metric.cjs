'use strict';
const { performance } = require('node:perf_hooks');

// 자식 출력 원문은 공개 facts에 넣지 않는다. 실행 결과의 메타데이터만 보존한다.
const readSelftestMetric = run => {
  const started = performance.now();
  let result;
  try { result = run(); }
  catch (error) { result = { error, status: null }; }
  result = result || {};
  const codes = new Set(['ETIMEDOUT', 'ENOENT', 'EACCES', 'EPERM', 'ENOBUFS', 'E2BIG']);
  const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);
  const observation = {
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ? (signals.has(result.signal) ? result.signal : 'OTHER') : null,
    errorCode: result.error ? (codes.has(result.error.code) ? result.error.code : 'OTHER') : null,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
    stdoutBytes: Buffer.byteLength(String(result.stdout || '')),
    stderrBytes: Buffer.byteLength(String(result.stderr || '')),
  };
  const fail = reasonCode => {
    const error = new Error(`selftest measurement: ${reasonCode}`);
    error.observation = { ...observation, reasonCode };
    throw error;
  };
  if (result.error) fail(result.error.code === 'ETIMEDOUT' ? 'timeout' : 'spawn_error');
  if (result.signal) fail('signal');
  if (result.status !== 0) fail('process_failed');
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch { fail('invalid_json'); }
  if (!payload || payload.ok !== true || !Number.isSafeInteger(payload.total) || payload.total <= 0) fail('invalid_result');
  return payload.total;
};

module.exports = { readSelftestMetric };
