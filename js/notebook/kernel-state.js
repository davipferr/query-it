// Estado compartilhado entre células — o "kernel" do notebook.
// Toda célula SQL grava seu resultado aqui; toda célula JS lê a partir daqui.
const state = {};

export function setVar(name, value) {
  state[name] = value;
}

export function getState() {
  return state;
}

export function getNames() {
  return Object.keys(state);
}

export function getValues() {
  return Object.values(state);
}
