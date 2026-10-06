import { runSqlCell } from './sql-cell.js';
import { runJsCell } from './js-cell.js';
import { createEditor, formatSql, LANGUAGES } from './editor.js';
import { h, show } from '../lib/dom.js';
import { removeVarsOf } from './kernel-state.js';
import { render as renderMarkdown } from '../markdown.js';
import { destroyResult } from './result-view.js';
import { getSettings } from '../settings.js';
import { connectionKey, getHistory } from '../history.js';

let counter = 0;

// Evento que sobe do .cell quando o código muda; o resto (nome, linguagem, ordem) já gera
// eventos nativos ou mutações no DOM que o app observa.
export const CELL_CHANGE_EVENT = 'cell-change';
// Evento que sobe do .cell pedindo "rodar desta célula até o fim"; quem roda em lote é o app (runner.js).
export const RUN_FROM_EVENT = 'run-from';

const RUN_LABEL = '▶ Run';
const STOP_LABEL = '■ Stop';

// Tipos de célula: sql e js rodam código; md é nota em Markdown (rodar só renderiza).
const DEFAULT_LANGUAGE = { sql: 'sql', js: 'js', md: 'markdown' };
const TYPE_LABEL = { sql: 'SQL', js: 'JS', md: 'NOTA' };
const PLACEHOLDER = {
  sql: 'SELECT * FROM ...',
  js: '// use as variáveis das células SQL/JS anteriores, ex: charts.createBarChart(el, minhaTabela.rows, {x:"nome", y:"total"})',
  md: '# Notas em Markdown: **negrito**, *itálico*, `código`, listas e [links](https://exemplo.com)',
};
const HISTORY_LABEL_MAX = 70;

const cellsByElement = new WeakMap();

// Chamado antes de restaurar células salvas, para um id novo nunca repetir um id restaurado.
export function reserveCellIds(n) {
  counter = Math.max(counter, n);
}

// `saved` vem de persistence.js: { id, name, language, source }, já validado.
export function createCell(type, saved = null) {
  let id = saved?.id;
  if (!id) {
    counter += 1;
    id = `cell_${counter}`;
  }
  // hasOwn, não LANGUAGES[x]: "constructor" ou "__proto__" vindos do storage existiriam via protótipo.
  const defaultLanguage = DEFAULT_LANGUAGE[type];
  const language = saved && Object.hasOwn(LANGUAGES, saved.language) ? saved.language : defaultLanguage;

  const outputEl = h('div', { className: 'cell-output' });
  const statusEl = h('span', { className: 'cell-status' });
  const runBtn = h('button', { type: 'button', className: 'run-btn' }, RUN_LABEL);
  const runBelowBtn = h(
    'button',
    { type: 'button', className: 'run-below-btn', title: 'Rodar desta célula até o fim' },
    '▶↓',
  );
  const moveUpBtn = h('button', { type: 'button', className: 'move-up-btn', title: 'Mover célula para cima' }, '▲');
  const moveDownBtn = h('button', { type: 'button', className: 'move-down-btn', title: 'Mover célula para baixo' }, '▼');
  const removeBtn = h('button', { type: 'button', className: 'remove-btn', title: 'Remover célula' }, '✕');
  const nameInput =
    type === 'sql'
      ? h('input', { className: 'cell-name', placeholder: 'nome da variável (opcional)', value: saved ? saved.name : id })
      : null;
  const languageSelect = h(
    'select',
    { className: 'cell-language', title: 'Linguagem do destaque de sintaxe' },
    Object.entries(LANGUAGES).map(([key, { label }]) => h('option', { value: key, selected: key === language }, label)),
  );
  const sourceEl = h('div', { className: 'cell-source' });
  const formatBtn =
    type === 'sql' ? h('button', { type: 'button', className: 'format-btn', title: 'Formatar o SQL no dialeto da conexão' }, 'Formatar') : null;
  const historySelect =
    type === 'sql'
      ? h('select', { className: 'cell-history', title: 'Consultas que deram certo nesta conexão' }, h('option', { value: '' }, 'Histórico…'))
      : null;

  const el = h(
    'div',
    { className: `cell cell-${type}` },
    h(
      'div',
      { className: 'cell-header' },
      h('span', { className: 'cell-type' }, TYPE_LABEL[type]),
      nameInput ?? h('span', { style: { flex: '1' } }),
      formatBtn,
      historySelect,
      languageSelect,
      runBtn,
      runBelowBtn,
      statusEl,
      moveUpBtn,
      moveDownBtn,
      removeBtn,
    ),
    sourceEl,
    outputEl,
  );

  // A linguagem do editor muda só o destaque de sintaxe; a execução segue o tipo da célula.
  const editor = createEditor({
    parent: sourceEl,
    language,
    doc: saved?.source ?? '',
    onChange: () => el.dispatchEvent(new CustomEvent(CELL_CHANGE_EVENT, { bubbles: true })),
    placeholderText: PLACEHOLDER[type],
    onRun: () => runBtn.click(),
  });

  languageSelect.addEventListener('change', () => editor.setLanguage(languageSelect.value));

  formatBtn?.addEventListener('click', async () => {
    try {
      editor.setValue(await formatSql(editor.getValue(), getSettings().dbType));
      statusEl.title = '';
    } catch (err) {
      statusEl.textContent = 'Não foi possível formatar';
      statusEl.title = err.message;
    }
  });

  // O histórico é por conexão e muda a cada consulta: a lista é montada ao chegar no seletor,
  // antes de ele abrir. Escolher uma entrada troca o texto do editor.
  let history = [];
  async function loadHistory() {
    history = getHistory(await connectionKey(getSettings()));
    show(
      historySelect,
      h('option', { value: '' }, history.length ? 'Histórico…' : 'Histórico (vazio)'),
      history.map((sql, i) => {
        const oneLine = sql.replace(/\s+/g, ' ');
        const label = oneLine.length > HISTORY_LABEL_MAX ? `${oneLine.slice(0, HISTORY_LABEL_MAX)}…` : oneLine;
        return h('option', { value: String(i), title: sql }, label);
      }),
    );
  }
  historySelect?.addEventListener('mouseenter', () => loadHistory().catch(() => {}));
  historySelect?.addEventListener('focus', () => loadHistory().catch(() => {}));
  historySelect?.addEventListener('change', () => {
    const sql = history[Number(historySelect.value)];
    historySelect.value = '';
    if (sql !== undefined) editor.setValue(sql);
  });

  // Uma execução por vez. Só a SQL pode ser interrompida: JS roda no próprio navegador e não
  // tem como parar código já em andamento, então o botão fica desabilitado até ela terminar.
  let controller = null;
  let current = null;

  // Chamar run() com a célula já rodando devolve a execução em andamento em vez de recusar:
  // assim "Rodar tudo" que chega numa célula rodada à mão espera por ela e usa o resultado.
  function run() {
    current ??= execute().finally(() => {
      current = null;
    });
    return current;
  }

  async function execute() {
    controller = new AbortController();
    if (type === 'sql') runBtn.textContent = STOP_LABEL;
    else runBtn.disabled = true;
    try {
      if (type === 'sql') {
        return await runSqlCell({ sql: editor.getValue(), outputEl, statusEl, nameInput, id, signal: controller.signal });
      }
      if (type === 'md') return renderNote();
      return await runJsCell({ code: editor.getValue(), outputEl, statusEl, id });
    } finally {
      controller = null;
      runBtn.textContent = RUN_LABEL;
      runBtn.disabled = false;
    }
  }

  function stop() {
    controller?.abort();
  }

  // Nota: "rodar" é só renderizar o Markdown (sempre dá certo, então não para o "Rodar tudo").
  function renderNote() {
    show(outputEl, h('div', { className: 'markdown' }, renderMarkdown(editor.getValue())));
    return true;
  }

  runBtn.addEventListener('click', () => {
    if (controller) stop();
    else run();
  });

  runBelowBtn.addEventListener('click', () => {
    el.dispatchEvent(new CustomEvent(RUN_FROM_EVENT, { bubbles: true }));
  });

  // Mover só reordena o DOM: as variáveis do kernel seguem a ordem de execução, não a posição.
  moveUpBtn.addEventListener('click', () => {
    const prev = el.previousElementSibling;
    if (prev) prev.before(el);
  });

  moveDownBtn.addEventListener('click', () => {
    const next = el.nextElementSibling;
    if (next) next.after(el);
  });

  removeBtn.addEventListener('click', () => {
    stop();
    destroyResult(outputEl);
    editor.destroy();
    el.remove();
    // A variável sai junto, senão células JS seguiriam lendo um resultado de célula que não existe mais.
    removeVarsOf(id);
  });

  // Célula restaurada não roda sozinha: isso consultaria o banco sem o usuário pedir.
  // Nota não tem efeito colateral, então já volta renderizada.
  if (saved && type === 'md') renderNote();
  else if (saved) statusEl.textContent = 'Não executada';

  const serialize = () => ({
    id,
    type,
    ...(nameInput ? { name: nameInput.value } : {}),
    language: languageSelect.value,
    source: editor.getValue(),
  });

  const cell = { id, type, el, editor, outputEl, statusEl, nameInput, serialize, run, stop };
  cellsByElement.set(el, cell);
  return cell;
}

// Células na ordem do DOM: é a ordem salva e a ordem de "Rodar tudo".
export function cellsIn(container) {
  return [...container.children].map((el) => cellsByElement.get(el)).filter(Boolean);
}

export function serializeCells(container) {
  return cellsIn(container).map((cell) => cell.serialize());
}

export function insertSqlPreset(container, sqlText) {
  const cell = createCell('sql');
  cell.editor.setValue(sqlText);
  container.appendChild(cell.el);
  cell.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
