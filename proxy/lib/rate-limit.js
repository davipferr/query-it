// Rate limit best-effort, em memória por instância.
// Serverless recicla instâncias (cold start reseta o contador), então isto NÃO é
// uma garantia forte — é uma primeira barreira. Para a instância pública compartilhada,
// o recomendado é evoluir para um store durável (ex: Upstash Redis, free tier).
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map();

export function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const timestamps = (hits.get(ip) || []).filter((t) => t > windowStart);
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length <= MAX_REQUESTS;
}
