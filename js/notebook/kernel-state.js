// Estado compartilhado entre células — o "kernel" do notebook.
// Toda célula SQL grava seu resultado aqui; células JS leem daqui e podem gravar com setVar.
// Sem protótipo: um nome como "__proto__" vira só mais uma variável, não troca o protótipo do estado.
const state = Object.create(null);
// Qual célula gravou cada nome por último. Remover ou rodar de novo uma célula apaga só o que
// ainda é dela; um nome que outra célula regravou depois fica.
const owners = new Map();

export function getState() {
  return state;
}

// Nome de variável do kernel: vira identificador JS válido para ser parâmetro das células JS.
export function toVarName(name) {
  const clean = String(name).trim().replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(clean) ? clean : `_${clean}`;
}

// Troca de uma vez tudo o que `owner` gravou pelas entradas novas ([nome, valor][]).
// Assim uma célula renomeada ou que parou de gravar um nome não deixa variável velha para trás.
export function replaceVarsOf(owner, entries) {
  removeVarsOf(owner);
  for (const [name, value] of entries) {
    state[name] = value;
    owners.set(name, owner);
  }
}

export function removeVarsOf(owner) {
  for (const [name, who] of owners) {
    if (who !== owner) continue;
    delete state[name];
    owners.delete(name);
  }
}
