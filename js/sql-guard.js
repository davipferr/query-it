// Pré-checagem client-side: só UX (feedback rápido), NUNCA a barreira de segurança real.
// A validação que é efetivamente contra roda no proxy, com um parser de SQL de verdade.
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|exec|execute|merge|call)\b/i;

// Strings, identificadores citados e comentários, na ordem em que aparecem.
// Aspas dobradas ('it''s', "a""b") são o escape do próprio SQL.
const LITERALS = /'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g;

// Troca strings e nomes citados por um marcador vazio e remove comentários, para as checagens
// abaixo olharem só a estrutura: "where status = 'delete'" não é um DELETE.
// Uma aspa sem par fica como está, e a consulta segue para o proxy decidir.
function stripLiterals(sql) {
  return sql.replace(LITERALS, (m) => (m.startsWith('--') || m.startsWith('/*') ? ' ' : `${m[0]}${m.at(-1)}`));
}

export function precheckReadOnly(sql) {
  const trimmed = stripLiterals(sql).trim().replace(/;+\s*$/, "");

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
