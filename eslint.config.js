// Regras duras do projeto. Cada uma existe porque o atalho que ela proíbe já causou bug
// aqui ou é o tipo de atalho que um agente pega. O caminho certo está na mensagem.
import js from "@eslint/js";
import globals from "globals";

const RAW_HTML = [
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: "Não monte HTML com string: use h()/show()/showMessage() de js/lib/dom.js (dado do banco vira XSS).",
  },
  {
    selector:
      "CallExpression[callee.property.name='insertAdjacentHTML'], CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: "Não monte HTML com string: use h()/show() de js/lib/dom.js.",
  },
];

// Comentários que viram lixo quando agentes escrevem código:
// - código comentado (o histórico fica no git);
// - marcadores de pendência soltos (bug conhecido vira teste { todo } ou "Known bugs" no feature map).
// Marcadores só em maiúsculas: em português "todo" é palavra comum.
const CODE_LIKE = [
  /^\s*(const|let|var|if|for|while|return|import|export|await|function|class)\b/,
  /^\s*[\w$.[\]]+\s*(=|\+=|-=)\s*\S.*;\s*$/,
  /^\s*[\w$.]+\(.*\)\s*;?\s*$/,
  /^\s*[{}]\s*$/,
];
const MARKER = /\b(TODO|FIXME|XXX|HACK)\b/;
const commentHygiene = {
  meta: {
    type: "suggestion",
    messages: {
      code: "Código comentado: apague (o histórico fica no git).",
      marker: "{{marker}} solto: vire teste com { todo } ou entrada em Known bugs no docs/feature-map.md.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const marker = MARKER.exec(comment.value);
          if (marker) context.report({ loc: comment.loc, messageId: "marker", data: { marker: marker[1] } });
          if (comment.type === "Line" && CODE_LIKE.some((re) => re.test(comment.value))) {
            context.report({ loc: comment.loc, messageId: "code" });
          }
        }
      },
    };
  },
};

export default [
  { ignores: ["**/node_modules/**"] },
  js.configs.recommended,
  {
    plugins: { local: { rules: { "comment-hygiene": commentHygiene } } },
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": ["error", ...RAW_HTML],
      "local/comment-hygiene": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // Frontend: roda no navegador, nunca importa o proxy, e só js/lib/api.js fala com a rede.
  {
    files: ["js/**/*.js"],
    languageOptions: { globals: { ...globals.browser, Chart: "readonly" } },
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/proxy/**"], message: "O frontend não importa nada do proxy." }] },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use runQuery() de js/lib/api.js." },
        { name: "XMLHttpRequest", message: "Use runQuery() de js/lib/api.js." },
      ],
    },
  },
  { files: ["js/lib/api.js"], rules: { "no-restricted-globals": "off" } },
  // Única exceção a new Function: a célula JS executa o código que o próprio usuário escreveu.
  { files: ["js/notebook/js-cell.js"], rules: { "no-new-func": "off" } },

  // Proxy e scripts: Node.
  {
    files: ["proxy/**/*.js", "scripts/**/*.js", "server.js", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["proxy/**/*.js"],
    ignores: ["proxy/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/js/**"], message: "O proxy não importa o frontend (o sql-guard do cliente é só UX)." },
          ],
        },
      ],
    },
  },
  // Só o handler escolhe driver, via o registro; guards e server.js não tocam em banco.
  {
    files: ["proxy/lib/*.js", "proxy/server.js"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/js/**"], message: "O proxy não importa o frontend." },
            { group: ["**/drivers/**", "pg", "mysql2", "mysql2/*", "mssql"], message: "Só proxy/api/query.js usa drivers (via drivers/index.js)." },
          ],
        },
      ],
    },
  },

  // Testes: Node, e podem cruzar fronteiras para testar contratos (ex.: preset do frontend contra o guard do proxy).
  {
    files: ["test/**/*.js", "proxy/test/**/*.js"],
    languageOptions: { globals: globals.node },
  },
];
