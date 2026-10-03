// Único ponto do frontend que fala com o proxy (fetch fora daqui é proibido pelo ESLint).
import { getSettings } from '../settings.js';

// Erro devolvido pelo proxy (validação, guard, banco). Erro de rede chega como TypeError do fetch.
export class ProxyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
  }
}

// Qual configuração falta para consultar, ou null se está tudo certo.
export function missingSetting(settings = getSettings()) {
  if (!settings.connectionString) return 'connectionString';
  if (!settings.proxyUrl) return 'proxyUrl';
  return null;
}

// POST /api/query com a conexão salva. Resolve com { columns, rows, rowCount, elapsedMs, truncated }.
export async function runQuery(sql, settings = getSettings()) {
  const res = await fetch(settings.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dbType: settings.dbType,
      connectionString: settings.connectionString,
      sql,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new ProxyError(data.error || 'Falha desconhecida.', res.status);
  return data;
}
