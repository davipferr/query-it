// Conexões salvas, com nome, e qual está ativa. Sem DOM nem localStorage, para testar no Node;
// settings.js lê e grava. Formato salvo:
//   { proxyUrl, activeId, connections: [{ id, name, dbType, connectionString }] }
// O formato antigo ({ dbType, connectionString, proxyUrl }) vira uma conexão "Padrão".

export const DEFAULT_NAME = 'Padrão';

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

// Recebe o JSON salvo (não confiável: pode ser de uma versão antiga ou editado à mão) e sempre
// devolve um formato válido com pelo menos uma conexão, para o app ter uma ativa.
export function normalizeSettings(raw, defaults) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const proxyUrl = str(data.proxyUrl, defaults.proxyUrl);

  let connections;
  if (Array.isArray(data.connections)) {
    const seen = new Set();
    connections = data.connections
      .filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id && !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({
        id: c.id,
        name: str(c.name).trim() || DEFAULT_NAME,
        dbType: str(c.dbType, defaults.dbType) || defaults.dbType,
        connectionString: str(c.connectionString),
      }));
  } else {
    connections = [
      {
        id: 'conn_1',
        name: DEFAULT_NAME,
        dbType: str(data.dbType, defaults.dbType) || defaults.dbType,
        connectionString: str(data.connectionString),
      },
    ];
  }
  if (!connections.length) {
    connections = [{ id: 'conn_1', name: DEFAULT_NAME, dbType: defaults.dbType, connectionString: '' }];
  }

  const activeId = connections.some((c) => c.id === data.activeId) ? data.activeId : connections[0].id;
  return { proxyUrl, activeId, connections };
}

export function activeConnection(settings) {
  return settings.connections.find((c) => c.id === settings.activeId) ?? settings.connections[0];
}

// O que o resto do app usa (api.js, editor, schema): a conexão ativa achatada.
// Quem só precisa de dbType/connectionString/proxyUrl não precisa saber que existem várias.
export function flatten(settings) {
  const active = activeConnection(settings);
  return {
    dbType: active.dbType,
    connectionString: active.connectionString,
    proxyUrl: settings.proxyUrl,
    connectionName: active.name,
    activeId: settings.activeId,
    connections: settings.connections,
  };
}

export function newConnectionId(connections) {
  const max = connections.reduce((n, c) => Math.max(n, Number(/^conn_(\d+)$/.exec(c.id)?.[1] ?? 0)), 0);
  return `conn_${max + 1}`;
}

// Insere ou troca pelo id. Não muda qual está ativa.
export function upsertConnection(settings, connection) {
  const exists = settings.connections.some((c) => c.id === connection.id);
  return {
    ...settings,
    connections: exists
      ? settings.connections.map((c) => (c.id === connection.id ? connection : c))
      : [...settings.connections, connection],
  };
}

// A última conexão não sai: o app sempre precisa de uma ativa. Removendo a ativa, a primeira assume.
export function removeConnection(settings, id) {
  if (settings.connections.length <= 1) return settings;
  const connections = settings.connections.filter((c) => c.id !== id);
  const activeId = settings.activeId === id ? connections[0].id : settings.activeId;
  return { ...settings, connections, activeId };
}

export function setActive(settings, id) {
  return settings.connections.some((c) => c.id === id) ? { ...settings, activeId: id } : settings;
}
