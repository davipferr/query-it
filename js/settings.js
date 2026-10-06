import {
  normalizeSettings,
  flatten,
  activeConnection,
  newConnectionId,
  upsertConnection,
  removeConnection,
  setActive,
} from './connections.js';
import { runQuery } from './lib/api.js';
import { TEST_QUERY } from './sql-preset.js';
import { h, show } from './lib/dom.js';

const STORAGE_KEY = 'queryit.settings';

const DEFAULTS = {
  dbType: 'postgres',
  // Rodando localmente -> usa o proxy local (cd proxy && npm start).
  proxyUrl: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:3000/api/query'
    : '',
};

// Todas as conexões salvas: { proxyUrl, activeId, connections }. JSON corrompido vira os padrões.
export function getStoredSettings() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // ignora: normalizeSettings cai nos padrões
  }
  return normalizeSettings(raw, DEFAULTS);
}

// A conexão ativa achatada ({ dbType, connectionString, proxyUrl, ... }): o formato que o
// resto do app sempre usou, então quem só consulta não precisa saber que existem várias.
export function getSettings() {
  return flatten(getStoredSettings());
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings, DEFAULTS)));
}

// onSave(settingsAchatadas) roda depois de salvar no modal ou trocar a conexão no seletor do topo.
export function initSettingsUI({ onSave } = {}) {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('open-settings');
  const closeBtn = document.getElementById('close-settings');
  const form = document.getElementById('settings-form');
  const connectionEl = document.getElementById('setting-connection');
  const nameEl = document.getElementById('setting-connection-name');
  const dbTypeEl = document.getElementById('setting-db-type');
  const connEl = document.getElementById('setting-connection-string');
  const proxyEl = document.getElementById('setting-proxy-url');
  const newBtn = document.getElementById('new-connection');
  const deleteBtn = document.getElementById('delete-connection');
  const testBtn = document.getElementById('test-connection');
  const testResult = document.getElementById('test-connection-result');
  const switcher = document.getElementById('connection-switcher');

  // Rascunho do modal: só vai para o storage no Salvar; Cancelar descarta.
  let draft = null;
  let editingId = null;

  function connectionOptions(select, settings, selectedId) {
    // Nomes são do usuário: entram como texto via h().
    show(
      select,
      settings.connections.map((c) => h('option', { value: c.id, selected: c.id === selectedId }, c.name)),
    );
  }

  function refreshSwitcher() {
    const stored = getStoredSettings();
    connectionOptions(switcher, stored, stored.activeId);
  }

  function loadForm(id) {
    editingId = id;
    const c = draft.connections.find((x) => x.id === id);
    connectionOptions(connectionEl, draft, id);
    nameEl.value = c.name;
    dbTypeEl.value = c.dbType;
    connEl.value = c.connectionString;
    proxyEl.value = draft.proxyUrl;
    deleteBtn.disabled = draft.connections.length <= 1;
    show(testResult);
  }

  // Grava os campos do formulário na conexão em edição (no rascunho).
  function commitForm() {
    draft = upsertConnection(draft, {
      id: editingId,
      name: nameEl.value.trim() || 'Sem nome',
      dbType: dbTypeEl.value,
      connectionString: connEl.value.trim(),
    });
    draft = { ...draft, proxyUrl: proxyEl.value.trim() };
  }

  function open() {
    draft = getStoredSettings();
    loadForm(activeConnection(draft).id);
    modal.classList.remove('hidden');
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  connectionEl.addEventListener('change', () => {
    commitForm();
    loadForm(connectionEl.value);
  });

  newBtn.addEventListener('click', () => {
    commitForm();
    const id = newConnectionId(draft.connections);
    draft = upsertConnection(draft, { id, name: 'Nova conexão', dbType: dbTypeEl.value, connectionString: '' });
    loadForm(id);
    nameEl.select();
  });

  deleteBtn.addEventListener('click', () => {
    draft = removeConnection(draft, editingId);
    loadForm(activeConnection(draft).id);
  });

  // Testa o que está no formulário, salvo ou não: dá para conferir antes de salvar.
  testBtn.addEventListener('click', async () => {
    const settings = { dbType: dbTypeEl.value, connectionString: connEl.value.trim(), proxyUrl: proxyEl.value.trim() };
    if (!settings.connectionString || !settings.proxyUrl) {
      show(testResult, 'Preencha a connection string e o Proxy URL.');
      testResult.className = 'hint error';
      return;
    }
    show(testResult, 'Testando…');
    testResult.className = 'hint';
    testBtn.disabled = true;
    const started = performance.now();
    try {
      await runQuery(TEST_QUERY, { settings });
      show(testResult, `Conexão OK (${Math.round(performance.now() - started)}ms)`);
      testResult.className = 'hint ok';
    } catch (err) {
      // A mensagem do proxy já passou pelo sanitizeError; erro de rede é do próprio navegador.
      show(testResult, err.name === 'ProxyError' ? err.message : `Proxy inacessível: ${err.message}`);
      testResult.className = 'hint error';
    } finally {
      testBtn.disabled = false;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commitForm();
    draft = setActive(draft, editingId);
    saveSettings(draft);
    modal.classList.add('hidden');
    refreshSwitcher();
    onSave?.(getSettings());
  });

  switcher.addEventListener('change', () => {
    saveSettings(setActive(getStoredSettings(), switcher.value));
    onSave?.(getSettings());
  });

  refreshSwitcher();
  return { open };
}
