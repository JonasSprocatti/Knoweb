// Gera src/lib/emojis.ts a partir do emojibase-data (nomes e palavras em português).
// Rodar de novo ao atualizar o emojibase-data: node scripts/gerar-emojis.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const data = require("emojibase-data/pt/data.json");

// Emojis mais novos que isso ainda aparecem como quadradinho em muitos aparelhos
const MAX_VERSION = 15;

// Palavras escolhidas à mão (as do seletor antigo), somadas às do emojibase.
// O primeiro grupo vira a aba "Trabalho", que abre por padrão.
const CURATED = [
  {
    name: "Trabalho",
    icon: "💼",
    items: `💼 trabalho maleta negocio|📁 pasta arquivo projeto|📂 pasta aberta|🗂️ divisorias organizar|📋 prancheta lista modelo|📌 alfinete fixar|📎 clipe anexo|📊 grafico barras relatorio|📈 grafico alta crescimento|📉 grafico queda|🗓️ calendario agenda|📅 calendario data prazo|⏰ alarme despertador prazo|⏱️ cronometro tempo|⌛ ampulheta espera|✅ feito concluido ok|☑️ marcado tarefa|📝 nota escrever memorando|✏️ lapis editar|🖊️ caneta|📄 documento pagina|📑 abas documentos|📦 caixa entrega pacote|🏷️ etiqueta tag rotulo|🔖 marcador|💰 dinheiro saco financeiro|💵 dinheiro nota|💳 cartao pagamento|🧾 recibo nota fiscal|🏦 banco|🏢 empresa predio escritorio|🏭 fabrica industria|🤝 acordo parceria aperto|📣 anuncio marketing|📢 alto falante aviso|🎯 alvo meta objetivo|🏆 trofeu vitoria|🥇 medalha primeiro|🚀 foguete lancamento|⚖️ balanca juridico lei|🛒 carrinho compras|🧮 abaco contas calculo`,
  },
  {
    name: "Tecnologia",
    icon: "💻",
    items: `💻 notebook computador|🖥️ monitor desktop|⌨️ teclado|🖱️ mouse|📱 celular mobile|☎️ telefone|🔌 tomada integracao|🔋 bateria|💾 disquete salvar|💿 disco|🗄️ arquivo gaveta|🗃️ fichario|🌐 internet web global|☁️ nuvem cloud|🔗 link corrente conexao|🔒 cadeado seguranca|🔑 chave acesso senha|🛡️ escudo protecao seguranca|🐛 bug inseto erro|⚙️ engrenagem configuracao sistema|🔧 chave ferramenta manutencao|🛠️ ferramentas|🔩 parafuso|🧰 caixa ferramentas|🤖 robo ia automacao|🧠 cerebro ia ideia|🧪 teste experimento|🔬 microscopio pesquisa|📡 antena sinal|🛰️ satelite|🔍 lupa busca pesquisa|💡 lampada ideia|🧩 quebra cabeca peca integracao|🗝️ chave antiga|📶 sinal rede|🖨️ impressora`,
  },
  {
    name: "Pessoas",
    icon: "🙂",
    items: `🙂 sorriso feliz|😀 feliz rindo|😎 legal oculos|🤔 pensando duvida|😴 sono|😅 ufa|🥳 festa comemorar|😍 amor|😢 triste|😡 bravo raiva|🤯 cabeca explodindo|👍 joinha ok|👎 negativo|👏 palmas|🙏 obrigado por favor|💪 forca|✌️ paz|👋 ola tchau|👀 olhos ver|👤 pessoa usuario|👥 pessoas grupo equipe|🧑‍💻 programador dev|👩‍💼 executiva|👨‍💼 executivo|🧑‍🏫 professor aula|🧑‍🎨 artista|🧑‍🔬 cientista|🧑‍⚕️ saude medico|👶 bebe|👪 familia|🗣️ falar conversa reuniao|💬 conversa mensagem chat|💭 pensamento|❤️ coracao amor|🔥 fogo urgente quente|⭐ estrela favorito|✨ brilho novo|💯 cem perfeito`,
  },
  {
    name: "Natureza",
    icon: "🌿",
    items: `🌿 folha planta|🌱 broto inicio crescer|🌳 arvore|🌲 pinheiro|🌵 cacto|🌸 flor|🌻 girassol|🍀 trevo sorte|🍁 outono folha|🌊 onda mar|🔥 fogo|💧 gota agua|⚡ raio energia rapido|🌙 lua noite|☀️ sol dia|🌈 arco iris|❄️ neve frio|🌍 terra mundo|🌎 americas mundo|🪐 planeta espaco|🌌 galaxia|🐶 cachorro|🐱 gato|🦊 raposa|🐻 urso|🐼 panda|🦉 coruja sabedoria|🐝 abelha|🦋 borboleta|🐢 tartaruga devagar|🐙 polvo|🐬 golfinho|🦁 leao|🐞 joaninha|🕸️ teia aranha`,
  },
  {
    name: "Comida",
    icon: "🍎",
    items: `🍎 maca fruta|🍌 banana|🍇 uva|🍓 morango|🍉 melancia|🍋 limao|🥑 abacate|🥕 cenoura|🌽 milho|🍞 pao|🧀 queijo|🍕 pizza|🍔 hamburguer|🌮 taco|🍣 sushi|🍝 macarrao|🍰 bolo|🍫 chocolate|🍪 biscoito|🍿 pipoca|☕ cafe|🍵 cha|🍺 cerveja|🍷 vinho|🥤 refrigerante|🍽️ prato refeicao`,
  },
  {
    name: "Atividades",
    icon: "⚽",
    items: `⚽ futebol|🏀 basquete|🎾 tenis|🏐 volei|🏋️ academia treino|🚴 bicicleta|🏃 corrida|🧘 meditacao yoga|🎮 videogame jogo|🎲 dado jogo|♟️ xadrez estrategia|🎨 arte pintura design|🎬 filme cinema video|🎵 musica|🎧 fone podcast|🎤 microfone gravacao|📷 camera foto|📚 livros estudo|📖 livro leitura|🎓 formatura curso|✈️ aviao viagem|🚗 carro|🏠 casa|🏖️ praia ferias|⛺ acampamento|🗺️ mapa|🧭 bussola direcao|🎁 presente|🎉 festa|🎈 balao`,
  },
  {
    name: "Símbolos",
    icon: "🔷",
    items: `🔴 vermelho circulo|🟠 laranja|🟡 amarelo|🟢 verde|🔵 azul|🟣 roxo|⚫ preto|⚪ branco|🟥 quadrado vermelho|🟧 quadrado laranja|🟨 quadrado amarelo|🟩 quadrado verde|🟦 quadrado azul|🟪 quadrado roxo|🔷 losango azul|🔶 losango laranja|❗ exclamacao importante|❓ pergunta|⚠️ alerta aviso|🚫 proibido|⛔ bloqueado|♻️ reciclar recorrente|🔁 repetir|🔄 atualizar sincronizar|➕ mais adicionar|➖ menos|✖️ fechar|🆕 novo|🆗 ok|🔝 topo|⬆️ cima|⬇️ baixo|➡️ direita proximo|⬅️ esquerda|📍 local pino|🏁 bandeira chegada fim|🚩 bandeira alerta|🇧🇷 brasil bandeira`,
  },
];

const plain = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const strip = (e) => e.replace(/️/g, "");

const extra = new Map();
for (const g of CURATED)
  for (const entry of g.items.split("|")) {
    const [emoji, ...words] = entry.trim().split(" ");
    extra.set(strip(emoji), [...(extra.get(strip(emoji)) ?? []), ...words]);
  }

const GROUPS = [
  [0, "Carinhas", "😀"],
  [1, "Pessoas", "👋"],
  [3, "Natureza", "🌿"],
  [4, "Comida", "🍎"],
  [5, "Viagem e lugares", "✈️"],
  [6, "Atividades", "⚽"],
  [7, "Objetos", "💡"],
  [8, "Símbolos", "🔷"],
  [9, "Bandeiras", "🏁"],
];

function words(e) {
  const w = new Set();
  for (const s of [e.label, ...(e.tags ?? []), ...(extra.get(strip(e.emoji)) ?? [])])
    for (const t of plain(s).split(/[^a-z0-9]+/)) if (t.length > 1) w.add(t);
  return [...w].join(" ");
}

const usable = data
  .filter((e) => e.group !== undefined && e.group !== 2 && Number(e.version) <= MAX_VERSION)
  .sort((a, b) => a.order - b.order);
const byEmoji = new Map(usable.map((e) => [strip(e.emoji), e]));

const out = [];
const work = CURATED[0];
out.push({
  name: "Trabalho",
  icon: work.icon,
  items: work.items.split("|").map((entry) => {
    const emoji = entry.trim().split(" ")[0];
    const e = byEmoji.get(strip(emoji));
    return `${emoji} ${e ? words(e) : plain(entry.trim().split(" ").slice(1).join(" "))}`;
  }),
});
for (const [group, name, icon] of GROUPS)
  out.push({ name, icon, items: usable.filter((e) => e.group === group).map((e) => `${e.emoji} ${words(e)}`) });

const body = out
  .map((g) => `  {\n    name: ${JSON.stringify(g.name)},\n    icon: ${JSON.stringify(g.icon)},\n    items: ${JSON.stringify(g.items.join("|"))},\n  },`)
  .join("\n");
writeFileSync(
  new URL("../src/lib/emojis.ts", import.meta.url),
  `// Gerado por scripts/gerar-emojis.mjs a partir do emojibase-data. Não editar à mão.\n\n` +
    `/** Emojis por grupo; depois de cada emoji, palavras para a busca (sem acento, separadas por espaço). */\n` +
    `export const EMOJI_GROUPS: { name: string; icon: string; items: string }[] = [\n${body}\n];\n`,
);
console.log(out.map((g) => `${g.name}: ${g.items.length}`).join("\n"));
