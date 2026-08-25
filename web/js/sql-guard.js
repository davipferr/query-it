// Pré-checagem client-side: só UX (feedback rápido), NUNCA a barreira de segurança real.
// A validação que é efetivamente contra roda no proxy, com um parser de SQL de verdade.
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|exec|execute|merge|call)\b/i;

export function precheckReadOnly(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");

  if (!trimmed) {
    return { ok: false, reason: "Escreva uma consulta antes de rodar." };
  }
  if (/;/.test(trimmed)) {
    return { ok: false, reason: "Apenas um comando por célula é permitido." };
  }
  if (FORBIDDEN.test(trimmed)) {
    return {
      ok: false,
      reason: "Somente consultas de leitura (SELECT) são permitidas.",
    };
  }
  if (!/^\s*(select|with)\b/i.test(trimmed)) {
    return { ok: false, reason: "A consulta deve começar com SELECT ou WITH." };
  }
  return { ok: true };
}
