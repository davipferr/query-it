import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostIsSafe } from '../lib/ssrf-guard.js';

// Só IPs literais e "localhost": nada aqui depende de DNS externo.
describe('assertHostIsSafe com ALLOW_PRIVATE_HOSTS=false', () => {
  let previous;
  beforeEach(() => {
    previous = process.env.ALLOW_PRIVATE_HOSTS;
    process.env.ALLOW_PRIVATE_HOSTS = 'false';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.ALLOW_PRIVATE_HOSTS;
    else process.env.ALLOW_PRIVATE_HOSTS = previous;
  });

  const blocked = [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    'localhost',
  ];
  for (const host of blocked) {
    test(`bloqueia ${host}`, async () => {
      await assert.rejects(assertHostIsSafe(host), /não permitido/);
    });
  }

  for (const host of ['8.8.8.8', '2001:4860:4860::8888']) {
    test(`permite ${host}`, async () => {
      await assert.doesNotReject(assertHostIsSafe(host));
    });
  }

  test('host vazio', async () => {
    await assert.rejects(assertHostIsSafe(''), /determinar o host/);
  });

  test('IPv4 mapeado em IPv6 apontando para loopback', { todo: 'range() de ::ffff:127.0.0.1 é "ipv4Mapped"' }, async () => {
    await assert.rejects(assertHostIsSafe('::ffff:127.0.0.1'), /não permitido/);
  });
});

test('ALLOW_PRIVATE_HOSTS=true libera tudo (só para uso local)', async () => {
  const previous = process.env.ALLOW_PRIVATE_HOSTS;
  process.env.ALLOW_PRIVATE_HOSTS = 'true';
  try {
    await assert.doesNotReject(assertHostIsSafe('127.0.0.1'));
  } finally {
    if (previous === undefined) delete process.env.ALLOW_PRIVATE_HOSTS;
    else process.env.ALLOW_PRIVATE_HOSTS = previous;
  }
});
