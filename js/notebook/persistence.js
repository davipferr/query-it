// Salva o código das células (não os resultados) para o notebook sobreviver a um reload.
// Resultados ficam de fora: são dados do banco, podem ser grandes ou sensíveis e ficam velhos.
export const STORAGE_KEY = 'queryit.notebook';
export const CORRUPT_KEY = 'queryit.notebook.corrupt';
export const VERSION = 1;

const CELL_TYPES = ['sql', 'js', 'md'];
// Até 9 dígitos: o contador continua um inteiro exato e o id não vira "cell_1e+21".
const ID_PATTERN = /^cell_\d{1,9}$/;

export function serialize(cells) {
  return JSON.stringify({ version: VERSION, cells });
}

// Recebe texto não confiável (storage editado à mão ou, no futuro, um arquivo importado):
// só passa o que tem formato conhecido, e cada campo vira string.
// `dropped` conta as células descartadas, para quem chama guardar uma cópia antes de sobrescrever.
export function parse(raw) {
  if (raw == null || raw === '') return { ok: true, cells: [], dropped: 0 };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, cells: [], dropped: 0 };
  }

  if (!data || data.version !== VERSION || !Array.isArray(data.cells)) {
    return { ok: false, cells: [], dropped: 0 };
  }

  const cells = [];
  const seenIds = new Set();
  let dropped = 0;
  for (const cell of data.cells) {
    if (!cell || !CELL_TYPES.includes(cell.type)) {
      dropped += 1;
      continue;
    }
    // O id vira nome de variável no kernel: fora do padrão cell_N ou repetido, a célula
    // recebe um id novo em vez de sobrescrever a variável de outra (ou o protótipo do estado).
    const validId = typeof cell.id === 'string' && ID_PATTERN.test(cell.id) && !seenIds.has(cell.id);
    if (validId) seenIds.add(cell.id);
    const restored = {
      id: validId ? cell.id : '',
      type: cell.type,
      language: typeof cell.language === 'string' ? cell.language : cell.type,
      source: typeof cell.source === 'string' ? cell.source : '',
    };
    if (cell.type === 'sql') restored.name = typeof cell.name === 'string' ? cell.name : '';
    cells.push(restored);
  }
  return { ok: true, cells, dropped };
}

// Maior N entre ids "cell_N", para o contador de células não reaproveitar um id restaurado.
export function maxCellNumber(cells) {
  let max = 0;
  for (const { id } of cells) {
    if (ID_PATTERN.test(id)) max = Math.max(max, Number(id.slice('cell_'.length)));
  }
  return max;
}

// problem: null (tudo lido), 'unreadable' (nada aproveitável) ou 'partial' (células descartadas).
// Com problem, o texto original é copiado para backupKey antes que o próximo save o sobrescreva;
// backupKey null significa que a cópia falhou e quem chama não deve salvar por cima.
export function loadNotebook(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    // Storage inacessível (modo privado, dados bloqueados): não há o que perder.
    return { cells: [], problem: null, backupKey: null };
  }

  const result = parse(raw);
  const problem = !result.ok ? 'unreadable' : result.dropped > 0 ? 'partial' : null;
  if (!problem) return { cells: result.cells, problem, backupKey: null };
  return { cells: result.cells, problem, backupKey: backUp(storage, raw) };
}

// Uma cópia anterior diferente não é sobrescrita: a nova vai para uma chave com timestamp.
function backUp(storage, raw) {
  try {
    const existing = storage.getItem(CORRUPT_KEY);
    const key = existing == null || existing === raw ? CORRUPT_KEY : `${CORRUPT_KEY}.${Date.now()}`;
    storage.setItem(key, raw);
    return key;
  } catch {
    return null;
  }
}

// Retorna false quando o navegador recusa a escrita (cota cheia, modo privado).
export function saveNotebook(cells, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, serialize(cells));
    return true;
  } catch {
    return false;
  }
}
