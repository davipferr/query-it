// Editor de código das células (CodeMirror 6).
// Os pacotes vêm do esm.sh via o import map em index.html, que fixa as versões.
import { basicSetup } from 'codemirror';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { getSettings } from '../settings.js';

// Cada linguagem só é baixada quando alguém a seleciona.
export const LANGUAGES = {
  sql: {
    label: 'SQL',
    load: async () => {
      const m = await import('@codemirror/lang-sql');
      const dialects = { postgres: m.PostgreSQL, mysql: m.MySQL, mssql: m.MSSQL };
      return m.sql({ dialect: dialects[getSettings().dbType] || m.StandardSQL });
    },
  },
  js: {
    label: 'JavaScript',
    load: async () => (await import('@codemirror/lang-javascript')).javascript(),
  },
  json: {
    label: 'JSON',
    load: async () => (await import('@codemirror/lang-json')).json(),
  },
  python: {
    label: 'Python',
    load: async () => (await import('@codemirror/lang-python')).python(),
  },
  html: {
    label: 'HTML',
    load: async () => (await import('@codemirror/lang-html')).html(),
  },
  css: {
    label: 'CSS',
    load: async () => (await import('@codemirror/lang-css')).css(),
  },
  markdown: {
    label: 'Markdown',
    load: async () => (await import('@codemirror/lang-markdown')).markdown(),
  },
  text: {
    label: 'Texto puro',
    load: async () => [],
  },
};

const theme = EditorView.theme({
  '&': { fontSize: '0.85rem', backgroundColor: '#0b0d11' },
  '.cm-gutters': { backgroundColor: '#0b0d11' },
  '.cm-content, .cm-gutters': { fontFamily: 'var(--font-mono)' },
  '.cm-scroller': { minHeight: '5.5rem', maxHeight: '28rem' },
  '&.cm-focused': { outline: 'none' },
});

export function createEditor({ parent, language, placeholderText = '', onRun }) {
  const languageSlot = new Compartment();

  const view = new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        // Ctrl/Cmd+Enter roda a célula; precedência alta para vencer os atalhos padrão.
        Prec.highest(
          keymap.of([{ key: 'Mod-Enter', run: () => (onRun?.(), true) }]),
        ),
        basicSetup,
        oneDark,
        theme,
        placeholder(placeholderText),
        languageSlot.of([]),
      ],
    }),
  });

  let current = null;

  async function setLanguage(key) {
    current = key;
    const extension = await LANGUAGES[key].load();
    // Se o usuário trocou de novo enquanto baixava, ignora o resultado antigo.
    if (current !== key) return;
    view.dispatch({ effects: languageSlot.reconfigure(extension) });
  }

  setLanguage(language);

  return {
    view,
    setLanguage,
    getLanguage: () => current,
    getValue: () => view.state.doc.toString(),
    setValue: (text) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    focus: () => view.focus(),
  };
}
