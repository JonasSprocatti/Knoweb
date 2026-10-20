// Verifica os trechos do "Perguntar" e a detecção de nomes citados da análise: node --experimental-strip-types scripts/ask-excerpts-check.mjs
import assert from "node:assert/strict";
import { cited, excerpts, keywords, plain } from "../src/lib/server/claude.ts";

assert.deepStrictEqual(keywords("Como está o chamado da SAP com o Leibson?"), ["chamado", "sap", "leibson"]);
const filler = "x".repeat(5000);
const text = `${filler} O Leibson respondeu o chamado. ${filler} Fim com Leibson aqui. ${filler}`;
const out = excerpts(text, ["leibson"], 2500);
assert.ok(out.length <= 2500 + 20, `tamanho ${out.length}`);
assert.ok(out.includes("O Leibson respondeu") && out.includes("Leibson aqui"), "pega os dois trechos");
assert.strictEqual(excerpts("curto", ["nada"], 2500), "curto");
assert.ok(excerpts(text, ["inexistente"], 2500).length <= 1300, "sem palavra: só o começo");
assert.ok(excerpts("Ação " + filler + " ação final " + filler, ["acao"], 2500).includes("ação final"), "acentos");

const t = plain("Conversei com a Mônica e o Leibson sobre o SAP S/4HANA; Fabíola não veio.");
assert.ok(cited(t, "Mônica"));
assert.ok(cited(t, "Leibson Silva", true), "primeiro nome");
assert.ok(!cited(t, "Leibson Silva"), "projeto: só o nome inteiro");
assert.ok(!cited(t, "Fábio Souza", true), "Fábio não casa dentro de Fabíola");
assert.ok(cited(t, "SAP S/4HANA"));
assert.ok(!cited(t, "Ana"), "Ana não casa dentro de HANA");
console.log("ok");
