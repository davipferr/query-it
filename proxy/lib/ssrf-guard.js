import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

// Bloqueia hosts que resolvem para faixas privadas/reservadas/link-local
// (inclui 169.254.169.254, o endpoint clássico de metadata de nuvem usado em SSRF).
const BLOCKED_RANGES = new Set(['private', 'loopback', 'linkLocal', 'uniqueLocal', 'reserved', 'carrierGradeNat']);

export async function assertHostIsSafe(hostname) {
  // Só para dev local: com o proxy rodando na sua própria máquina (`npm start`),
  // bloquear localhost/loopback impediria justamente o caso de uso (banco local).
  // Em produção (servidor público) defina ALLOW_PRIVATE_HOSTS=false.
  if (process.env.ALLOW_PRIVATE_HOSTS === 'true') return;

  if (!hostname) {
    throw new Error('Não foi possível determinar o host da connection string.');
  }

  let addresses;
  if (ipaddr.isValid(hostname)) {
    addresses = [hostname];
  } else {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) {
      throw new Error(`Não foi possível resolver o host: ${hostname}`);
    }
    addresses = records.map((r) => r.address);
  }

  for (const address of addresses) {
    const addr = ipaddr.parse(address);
    const range = addr.range();
    if (BLOCKED_RANGES.has(range)) {
      throw new Error(`Conexão recusada: host resolve para um endereço não permitido (${address}).`);
    }
  }
}
