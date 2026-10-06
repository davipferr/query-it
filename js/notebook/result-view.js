// Saída de uma célula SQL: tabela com filtro, ordenação por coluna, exportação (CSV/JSON),
// cópia como tabela Markdown e um gráfico rápido. Valores e nomes vêm do banco: só h()/show().
import { h, show } from '../lib/dom.js';
import * as charts from '../charts.js';
import {
  formatValue,
  filterRows,
  sortRows,
  nextSort,
  toCsv,
  toMarkdownTable,
  toJson,
  numericColumns,
} from '../result-data.js';

const CHART_TYPES = { bar: 'Barras', line: 'Linha', pie: 'Pizza' };
// Tempo para o navegador começar a ler o arquivo antes de liberar o Blob.
const REVOKE_DELAY_MS = 10000;
// Sem BOM o Excel abre CSV como ANSI e estraga acentos.
const UTF8_BOM = '﻿';

// O Chart.js guarda cada gráfico num registro global (com ResizeObserver): trocar o conteúdo do
// container não basta para soltá-lo. Por isso o gráfico de cada saída fica aqui, para ser destruído.
const chartsByContainer = new WeakMap();

// Chamado antes de redesenhar a saída e ao remover a célula.
export function destroyResult(container) {
  chartsByContainer.get(container)?.destroy();
  chartsByContainer.delete(container);
}

// `name` vira o nome dos arquivos exportados.
export function renderResult(container, { columns, rows, name }) {
  destroyResult(container);
  if (!rows.length) {
    show(container, h('div', { className: 'empty' }, 'Sem resultados.'));
    return;
  }

  let sort = { colIndex: null, direction: null };
  let chart = null;
  const setChart = (next) => {
    chart?.destroy();
    chart = next;
    if (chart) chartsByContainer.set(container, chart);
    else chartsByContainer.delete(container);
  };

  // O que está na tela: é isso que exporta, copia e vai para o gráfico.
  const view = () => sortRows(filterRows(rows, filterEl.value), sort.colIndex, sort.direction);

  const tableWrap = h('div', { className: 'result-table' });
  const countEl = h('span', { className: 'result-count hint' });
  const messageEl = h('span', { className: 'result-message hint' });
  const chartPanel = h('div', { className: 'quick-chart hidden' });

  const filterEl = h('input', {
    type: 'search',
    className: 'result-filter',
    placeholder: 'Filtrar linhas',
    onInput: () => {
      renderTable();
      if (chart) drawChart();
    },
  });

  const wrapBtn = h('button', {
    type: 'button',
    className: 'wrap-toggle',
    title: 'Mostrar o texto inteiro das células, quebrando linhas',
    onClick: () => {
      const on = tableWrap.classList.toggle('wrap');
      wrapBtn.classList.toggle('active', on);
    },
  }, 'Quebrar texto');

  function say(text) {
    show(messageEl, text);
  }

  function download(extension, mime, text) {
    // Blob local + link com download: nada sai do navegador.
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = h('a', { href: url, download: `${name}.${extension}` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }

  async function copy() {
    const current = view();
    try {
      await navigator.clipboard.writeText(toMarkdownTable(columns, current));
      say(`Copiado como tabela Markdown: ${current.length} linha(s).`);
    } catch (err) {
      say(`Não foi possível copiar: ${err.message}`);
    }
  }

  function renderTable() {
    const current = view();
    show(countEl, current.length === rows.length ? `${rows.length} linha(s)` : `${current.length} de ${rows.length} linha(s)`);
    show(
      tableWrap,
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            columns.map((c, i) =>
              h(
                'th',
                {
                  className: 'sortable',
                  title: 'Ordenar por esta coluna',
                  onClick: () => {
                    sort = nextSort(sort, i);
                    renderTable();
                    if (chart) drawChart();
                  },
                },
                c,
                sort.colIndex === i ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '',
              ),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          current.map((row) =>
            h('tr', {}, row.map((v) => {
              const text = formatValue(v);
              // title mostra o valor inteiro quando a célula está cortada (sem "Quebrar texto").
              return h('td', { className: v === null || v === undefined ? 'null' : undefined, title: text }, text);
            })),
          ),
        ),
      ),
    );
  }

  // Gráfico rápido: escolhe tipo, eixo X (qualquer coluna) e Y (colunas numéricas).
  const numeric = numericColumns(columns, rows);
  const typeEl = h('select', { className: 'chart-type' }, Object.entries(CHART_TYPES).map(([v, label]) => h('option', { value: v }, label)));
  const xEl = h('select', { className: 'chart-x' }, columns.map((c) => h('option', { value: c }, c)));
  const yEl = h('select', { className: 'chart-y' }, numeric.map((c) => h('option', { value: c }, c)));
  // Por padrão o X é a primeira coluna que não é o Y, para não desenhar uma coluna contra ela mesma.
  xEl.value = columns.find((c) => c !== numeric[0]) ?? columns[0];
  const chartArea = h('div', { className: 'chart-area' });

  function drawChart() {
    setChart(null);
    if (!numeric.length) {
      show(chartArea, h('p', { className: 'hint' }, 'Nenhuma coluna numérica para o eixo Y.'));
      return;
    }
    const x = xEl.value;
    const y = yEl.value;
    const xi = columns.indexOf(x);
    const yi = columns.indexOf(y);
    // Texto numérico (numeric/decimal do Postgres) vira número para o Chart.js.
    const data = view().map((row) => ({ [x]: formatValue(row[xi]), [y]: row[yi] === null ? null : Number(row[yi]) }));
    setChart(
      typeEl.value === 'pie'
        ? charts.createPieChart(chartArea, data, { labelKey: x, valueKey: y })
        : (typeEl.value === 'line' ? charts.createLineChart : charts.createBarChart)(chartArea, data, { x, y }),
    );
  }

  for (const el of [typeEl, xEl, yEl]) el.addEventListener('change', drawChart);
  show(
    chartPanel,
    h(
      'div',
      { className: 'chart-controls' },
      h('label', {}, 'Tipo ', typeEl),
      h('label', {}, 'X ', xEl),
      h('label', {}, 'Y ', yEl),
    ),
    chartArea,
  );

  const chartBtn = h('button', {
    type: 'button',
    className: 'quick-chart-btn',
    onClick: () => {
      const opening = chartPanel.classList.contains('hidden');
      chartPanel.classList.toggle('hidden', !opening);
      chartBtn.classList.toggle('active', opening);
      if (opening) drawChart();
      else setChart(null);
    },
  }, 'Gráfico');

  show(
    container,
    h(
      'div',
      { className: 'result-toolbar' },
      filterEl,
      countEl,
      h('button', { type: 'button', className: 'export-csv-btn', title: 'Baixar as linhas visíveis em CSV', onClick: () => download('csv', 'text/csv;charset=utf-8', `${UTF8_BOM}${toCsv(columns, view())}`) }, 'CSV'),
      h('button', { type: 'button', className: 'export-json-btn', title: 'Baixar as linhas visíveis em JSON', onClick: () => download('json', 'application/json', toJson(columns, view())) }, 'JSON'),
      h('button', { type: 'button', className: 'copy-btn', title: 'Copiar as linhas visíveis como tabela Markdown', onClick: copy }, 'Copiar'),
      wrapBtn,
      chartBtn,
      messageEl,
    ),
    chartPanel,
    tableWrap,
  );
  renderTable();
}
