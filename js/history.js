// Histórico de consultas que deram certo, separado por conexão.
// A chave é um hash da conexão, não a connection string: assim a senha não fica copiada
// em mais um lugar do localStorage.
export const HISTORY_KEY = 'queryit.history';
export const MAX_PER_CONNECTION = 50;
export const MAX_CONNECTIONS = 20;

export async function connectionKey({ dbType, connectionString }) {
  const bytes = new TextEncoder().encode(`${dbType}\n${connectionString}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function read(storage) {
  try {
    const data = JSON.parse(storage.getItem(HISTORY_KEY));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// Mais recente primeiro, só strings (o storage pode ter sido editado à mão).
export function getHistory(key, storage = globalThis.localStorage) {
  const list = read(storage)[key];
  return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
}

// Consulta repetida sobe para o topo em vez de duplicar. Conexão usada agora também vai para o
// fim do objeto, e as mais antigas além de MAX_CONNECTIONS saem, para o histórico não crescer sem fim.
export function addToHistory(key, sql, storage = globalThis.localStorage) {
  const text = sql.trim();
  if (!text) return;
  const data = read(storage);
  const list = [text, ...getHistory(key, storage).filter((s) => s !== text)].slice(0, MAX_PER_CONNECTION);
  delete data[key];
  data[key] = list;
  const keys = Object.keys(data);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CONNECTIONS))) delete data[old];
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(data));
  } catch {
    // Cota cheia: o histórico é conveniência, perder uma entrada não quebra nada.
  }
}
