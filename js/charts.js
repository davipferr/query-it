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
  // Nomes de coluna e valores vêm do banco: sempre como texto, nunca HTML.
  const columns = Object.keys(rows[0]);
  const table = document.createElement("table");
  const headRow = table.createTHead().insertRow();
  for (const c of columns) {
    const th = document.createElement("th");
    th.textContent = c;
    headRow.appendChild(th);
  }
  const body = table.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    for (const c of columns) tr.insertCell().textContent = r[c] ?? "NULL";
  }
  container.appendChild(table);
}
