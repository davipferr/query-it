import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

// Só aceita endereços públicos (range "unicast" do ipaddr.js). Lista de permitidos em vez de
// lista de bloqueados: private, loopback, link-local (169.254.169.254, metadata de nuvem),
// 0.0.0.0, multicast, NAT64, 6to4 etc. ficam todos de fora sem precisar enumerar.

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
    let addr = ipaddr.parse(address);
    // ::ffff:127.0.0.1 é o IPv4 127.0.0.1 escrito em IPv6; avalia o IPv4 de dentro.
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    if (addr.range() !== 'unicast') {
      throw new Error(`Conexão recusada: host resolve para um endereço não permitido (${address}).`);
    }
  }
}
