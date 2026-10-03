import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit } from '../lib/rate-limit.js';

test('permite 30 requisições por minuto e bloqueia a 31ª', () => {
  const ip = 'rl-burst';
  for (let i = 0; i < 30; i++) assert.equal(checkRateLimit(ip), true, `requisição ${i + 1}`);
  assert.equal(checkRateLimit(ip), false);
});

test('IPs diferentes têm contadores separados', () => {
  for (let i = 0; i < 31; i++) checkRateLimit('rl-a');
  assert.equal(checkRateLimit('rl-b'), true);
});

test('libera de novo depois da janela de 60s', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const ip = 'rl-window';
  for (let i = 0; i < 31; i++) checkRateLimit(ip);
  assert.equal(checkRateLimit(ip), false);
  t.mock.timers.tick(60_001);
  assert.equal(checkRateLimit(ip), true);
});
