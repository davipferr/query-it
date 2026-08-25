import { runSqlCell } from './sql-cell.js';
import { runJsCell } from './js-cell.js';

let counter = 0;

export function createCell(type) {
  counter += 1;
  const id = `cell_${counter}`;

  const el = document.createElement('div');
  el.className = 'cell';
  el.innerHTML = `
    <div class="cell-header">
      <span class="cell-type">${type.toUpperCase()}</span>
      ${type === 'sql' ? `<input class="cell-name" placeholder="nome da variável (opcional)" value="${id}">` : '<span style="flex:1"></span>'}
      <button type="button" class="run-btn">▶ Run</button>
      <span class="cell-status"></span>
      <button type="button" class="remove-btn" title="Remover célula">✕</button>
    </div>
    <textarea class="cell-source" rows="4" placeholder="${
      type === 'sql' ? 'SELECT * FROM ...' : '// use as variáveis das células SQL/JS anteriores, ex: charts.createBarChart(el, minhaTabela.rows, {x:"nome", y:"total"})'
    }"></textarea>
    <div class="cell-output"></div>
  `;

  const sourceEl = el.querySelector('.cell-source');
  const outputEl = el.querySelector('.cell-output');
  const statusEl = el.querySelector('.cell-status');
  const runBtn = el.querySelector('.run-btn');
  const removeBtn = el.querySelector('.remove-btn');
  const nameInput = el.querySelector('.cell-name');

  runBtn.addEventListener('click', () => {
    if (type === 'sql') {
      runSqlCell({ sql: sourceEl.value, outputEl, statusEl, nameInput, id });
    } else {
      runJsCell({ code: sourceEl.value, outputEl, statusEl });
    }
  });

  sourceEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runBtn.click();
    }
  });

  removeBtn.addEventListener('click', () => el.remove());

  return { id, type, el, sourceEl, outputEl, statusEl, nameInput };
}

export function insertSqlPreset(container, sqlText) {
  const cell = createCell('sql');
  cell.sourceEl.value = sqlText;
  container.appendChild(cell.el);
  cell.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
