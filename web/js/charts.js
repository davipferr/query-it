function mountCanvas(container) {
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
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
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = '<div class="empty">Sem dados.</div>';
    return;
  }
  const columns = Object.keys(rows[0]);
  const table = document.createElement("table");
  table.innerHTML = `
    <thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${r[c] ?? "NULL"}</td>`).join("")}</tr>`).join("")}</tbody>
  `;
  container.appendChild(table);
}
