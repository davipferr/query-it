import { initSettingsUI, getSettings } from './settings.js';
import {
  createCell,
  insertSqlPreset,
  reserveCellIds,
  serializeCells,
  CELL_CHANGE_EVENT,
  RUN_FROM_EVENT,
} from './notebook/cell.js';
import { runFrom, stopBatch, isBatchRunning } from './notebook/runner.js';
import { loadNotebook, saveNotebook, maxCellNumber, STORAGE_KEY } from './notebook/persistence.js';
import { initSchemaExplorer } from './schema-explorer.js';

const cellsContainer = document.getElementById('cells');
const notebookStatus = document.getElementById('notebook-status');

const saved = loadNotebook();
// Sem cópia do que não pôde ser lido, salvar apagaria o único original: esta aba não salva.
const saveBlocked = Boolean(saved.problem) && !saved.backupKey;
if (saveBlocked) {
  notebookStatus.textContent =
    'O notebook salvo não pôde ser lido por inteiro e a cópia falhou; esta aba não vai salvar para não apagá-lo.';
} else if (saved.problem === 'unreadable') {
  notebookStatus.textContent = `O notebook salvo não pôde ser lido; uma cópia ficou em ${saved.backupKey}.`;
} else if (saved.problem === 'partial') {
  notebookStatus.textContent = `Algumas células salvas não puderam ser lidas; uma cópia do notebook ficou em ${saved.backupKey}.`;
}
reserveCellIds(maxCellNumber(saved.cells));
for (const data of saved.cells) {
  cellsContainer.appendChild(createCell(data.type, data).el);
}

// Espera o usuário parar de digitar antes de gravar, em vez de gravar a cada tecla.
const SAVE_DELAY_MS = 300;
let saveTimer = null;
// Vira true quando outra aba grava o notebook: a partir daí esta aba não grava sozinha,
// senão a última aba a salvar apagaria em silêncio o trabalho da outra.
let stale = false;

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (stale || saveBlocked) return;
  if (!saveNotebook(serializeCells(cellsContainer))) {
    notebookStatus.textContent = 'Não foi possível salvar o notebook neste navegador.';
  }
}

function scheduleSave() {
  if (stale || saveBlocked) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

// O evento `storage` só dispara nas outras abas, nunca na que gravou. key null = storage limpo.
// Recarregar as células sozinho apagaria as saídas desta aba, então o usuário escolhe.
const conflictEl = document.getElementById('notebook-conflict');
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  stale = true;
  clearTimeout(saveTimer);
  saveTimer = null;
  conflictEl.classList.remove('hidden');
});

document.getElementById('notebook-reload').addEventListener('click', () => location.reload());

// Grava a versão desta aba por cima; a outra aba é que passa a ver o aviso.
document.getElementById('notebook-keep').addEventListener('click', () => {
  stale = false;
  conflictEl.classList.add('hidden');
  saveNow();
});

// Adicionar, remover e mover células mexe nos filhos de #cells; nome e linguagem geram
// input/change nativos; o código gera CELL_CHANGE_EVENT a partir do editor.
new MutationObserver(scheduleSave).observe(cellsContainer, { childList: true });
cellsContainer.addEventListener('input', scheduleSave);
cellsContainer.addEventListener('change', scheduleSave);
cellsContainer.addEventListener(CELL_CHANGE_EVENT, scheduleSave);
// Fechar a aba dentro da janela do debounce não pode perder a última edição.
window.addEventListener('pagehide', () => {
  if (saveTimer) saveNow();
});

// O mesmo botão começa e para o lote.
const runAllBtn = document.getElementById('run-all');
function updateRunAll() {
  runAllBtn.textContent = isBatchRunning() ? '■ Parar' : '▶▶ Rodar tudo';
}
runAllBtn.addEventListener('click', () => {
  if (isBatchRunning()) stopBatch();
  else runFrom(cellsContainer, null, updateRunAll);
});
cellsContainer.addEventListener(RUN_FROM_EVENT, (e) => runFrom(cellsContainer, e.target, updateRunAll));

document.getElementById('add-sql-cell').addEventListener('click', () => {
  const cell = createCell('sql');
  cellsContainer.appendChild(cell.el);
  cell.editor.focus();
});

document.getElementById('add-js-cell').addEventListener('click', () => {
  const cell = createCell('js');
  cellsContainer.appendChild(cell.el);
  cell.editor.focus();
});

const settingsUI = initSettingsUI();

initSchemaExplorer({
  container: document.getElementById('schema-tree'),
  onPickTable: (sql) => insertSqlPreset(cellsContainer, sql),
});

if (!getSettings().connectionString) {
  settingsUI.open();
}
