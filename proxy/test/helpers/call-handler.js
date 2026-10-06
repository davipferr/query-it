// Chama o handler de /api/query sem subir servidor HTTP, com a mesma API de resposta do server.js.
import handler from '../../api/query.js';

let ipCounter = 0;

// `signal` faz o papel do cliente fechando a conexão (o server.js monta o mesmo req.signal).
export async function callHandler(body, { method = 'POST', headers = {}, signal } = {}) {
  const req = {
    method,
    body,
    signal,
    // IP novo por chamada para o rate limit não interferir entre testes.
    headers: { 'x-forwarded-for': `test-${++ipCounter}`, ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
    },
    end() {},
  };

  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}
