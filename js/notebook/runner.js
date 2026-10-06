// Execução em lote: "Rodar tudo" e "rodar desta célula até o fim".
// Roda em ordem, uma de cada vez (cada célula depende das variáveis das anteriores),
// e para na primeira que falhar, para não rodar células em cima de um resultado faltando.
import { cellsIn } from './cell.js';

let batch = null;

export function isBatchRunning() {
  return batch !== null;
}

// `startEl` null = do começo. `onChange` avisa quando o lote começa e termina, para o app
// trocar o botão "Rodar tudo" / "Parar". Resolve com true se todas rodaram sem erro.
export async function runFrom(container, startEl, onChange) {
  if (batch) return false;

  // Lista fixada no início: células adicionadas durante o lote ficam para depois.
  const all = cellsIn(container);
  const start = startEl ? all.findIndex((cell) => cell.el === startEl) : 0;
  if (start === -1) return false;

  let release;
  // Resolve com false quando alguém para o lote. Uma célula JS não pode ser interrompida, então
  // o lote corre contra este sinal: "Parar" libera o lote mesmo com a célula JS ainda rodando.
  const stoppedSignal = new Promise((resolve) => {
    release = () => resolve(false);
  });
  batch = { stopped: false, current: null, release };
  onChange?.();
  try {
    for (const cell of all.slice(start)) {
      if (batch.stopped) return false;
      // Removida no meio do lote: não há o que rodar.
      if (!cell.el.isConnected) continue;
      batch.current = cell;
      if (!(await Promise.race([cell.run(), stoppedSignal]))) return false;
    }
    return true;
  } finally {
    batch = null;
    onChange?.();
  }
}

// Não começa a próxima célula, cancela a consulta SQL em andamento e libera o lote na hora.
// Uma célula JS em andamento continua rodando sozinha até terminar (não há como pará-la).
export function stopBatch() {
  if (!batch) return;
  batch.stopped = true;
  batch.current?.stop();
  batch.release();
}
