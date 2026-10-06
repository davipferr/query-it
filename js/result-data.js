// Operações sobre um resultado de consulta ({ columns, rows: any[][] }) para a tabela de saída:
// ordenar, filtrar e exportar. Sem DOM, para dar para testar no Node.

// Texto mostrado na tabela e usado no filtro: o mesmo formato das células.
export function formatValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Linhas que contêm `text` em alguma coluna (sem diferenciar maiúsculas). Vazio = todas.
export function filterRows(rows, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.some((v) => formatValue(v).toLowerCase().includes(needle)));
}

// Número escrito como texto: o Postgres manda bigint e numeric assim ("-5.20", "9000000000").
const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function asNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMERIC_TEXT.test(v.trim())) return Number(v);
  return null;
}

// Ordena por uma coluna sem mexer no array original. NULL fica sempre no fim; números
// (inclusive em texto) comparam como números e o resto como texto, em português.
export function sortRows(rows, colIndex, direction) {
  if (direction !== 'asc' && direction !== 'desc') return rows;
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[colIndex];
    const y = b[colIndex];
    const xNull = x === null || x === undefined;
    const yNull = y === null || y === undefined;
    if (xNull || yNull) return xNull === yNull ? 0 : xNull ? 1 : -1;
    const nx = asNumber(x);
    const ny = asNumber(y);
    if (nx !== null && ny !== null) return (nx - ny) * sign;
    return formatValue(x).localeCompare(formatValue(y), 'pt-BR', { numeric: true }) * sign;
  });
}

// Próximo estado ao clicar no cabeçalho: crescente, decrescente, sem ordem.
export function nextSort(current, colIndex) {
  if (current.colIndex !== colIndex) return { colIndex, direction: 'asc' };
  if (current.direction === 'asc') return { colIndex, direction: 'desc' };
  return { colIndex: null, direction: null };
}

// Planilhas executam como fórmula uma célula que começa com = + - @ (ou tab/CR); como os
// valores vêm do banco, quem controla um dado poderia rodar algo no Excel de quem abre o CSV.
// Número (inclusive em texto, como "-5.20") não recebe o prefixo ': continua número na planilha.
function neutralizeFormula(v) {
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !NUMERIC_TEXT.test(v) ? `'${v}` : v;
}

function csvField(v) {
  if (v === null || v === undefined) return '';
  const text = formatValue(neutralizeFormula(v));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// CSV no formato RFC 4180 (CRLF, aspas dobradas). NULL vira campo vazio.
export function toCsv(columns, rows) {
  return [columns, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// Texto literal numa célula de tabela Markdown: os valores vêm do banco, então `|` não pode
// quebrar a tabela e * _ ` [ ] < > ~ \ não podem virar formatação, link ou HTML onde for colado.
// Quebra de linha dentro do valor vira espaço (a tabela é uma linha por registro).
function markdownCell(v) {
  return formatValue(v)
    .replace(/[\\`*_[\]<>|~]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');
}

// Tabela Markdown (GFM) para colar em issue, PR, wiki ou chat. Colunas numéricas alinhadas à direita.
export function toMarkdownTable(columns, rows) {
  const numeric = new Set(numericColumns(columns, rows));
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [
    line(columns.map(markdownCell)),
    line(columns.map((c) => (numeric.has(c) ? '---:' : '---'))),
    ...rows.map((row) => line(row.map(markdownCell))),
  ].join('\n');
}

// JSON como lista de objetos (o mesmo formato de `rows` nas células JS).
export function toJson(columns, rows) {
  const objects = rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null])));
  return JSON.stringify(objects, null, 2);
}

// Colunas que dá para usar como eixo Y de um gráfico: todos os valores não nulos são números
// (ou texto numérico, como numeric/decimal vindos do Postgres).
export function numericColumns(columns, rows) {
  return columns.filter((_, i) => {
    const values = rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined);
    return values.length > 0 && values.every((v) => asNumber(v) !== null);
  });
}
