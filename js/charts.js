import { h, show } from "./lib/dom.js";

function mountCanvas(container) {
  const canvas = h("canvas");
  show(container, canvas);
  return canvas;
}

export function createBarChart(container, rows, { x, y, label = y } = {}) {
  const canvas = mountCanvas(container);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r[x]),
      datasets: [{ label, data: rows.map((r) => r[y]) }],
    },
  });
}

export function createLineChart(container, rows, { x, y, label = y } = {}) {
  const canvas = mountCanvas(container);
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((r) => r[x]),
      datasets: [{ label, data: rows.map((r) => r[y]) }],
    },
  });
}

export function createPieChart(container, rows, { labelKey, valueKey } = {}) {
  const canvas = mountCanvas(container);
  return new Chart(canvas, {
    type: "pie",
    data: {
      labels: rows.map((r) => r[labelKey]),
      datasets: [{ data: rows.map((r) => r[valueKey]) }],
    },
  });
}

export function createTable(container, rows) {
  if (!rows.length) {
    show(container, h("div", { className: "empty" }, "Sem dados."));
    return;
  }
  // Nomes de coluna e valores vêm do banco: h() sempre os trata como texto.
  const columns = Object.keys(rows[0]);
  show(
    container,
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, columns.map((c) => h("th", {}, c)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, columns.map((c) => h("td", {}, r[c] ?? "NULL"))))),
    ),
  );
}
