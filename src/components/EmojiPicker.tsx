"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Emojis por grupo; depois de cada emoji, palavras para a busca (separadas por espaço). */
const GROUPS: { name: string; icon: string; items: string }[] = [
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

const ALL = GROUPS.flatMap((g) =>
  g.items.split("|").map((entry) => {
    const [emoji, ...words] = entry.trim().split(" ");
    return { emoji, words: words.join(" ") };
  }),
);
const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Campo de emoji para formulários: um botão abre o seletor (grupos + busca) e o
 * valor vai num input escondido com o mesmo `name`. Também aceita colar qualquer emoji.
 */
export function EmojiPicker({
  name = "emoji",
  defaultValue = "",
  placeholder = "🙂",
  label = "Emoji",
  className = "",
}: {
  name?: string;
  defaultValue?: string | null;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [group, setGroup] = useState(0);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Fecha ao tocar fora ou com Esc
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const shown = useMemo(() => {
    const q = plain(query.trim());
    if (!q) return GROUPS[group].items.split("|").map((e) => e.trim().split(" ")[0]);
    return [...new Set(ALL.filter((e) => plain(e.words).includes(q)).map((e) => e.emoji))];
  }, [group, query]);

  function pick(emoji: string) {
    setValue(emoji);
    setQuery("");
    if (ref.current) ref.current.open = false;
  }

  // Busca: se o texto já for um emoji (colado ou do teclado do sistema), Enter usa ele mesmo
  const typedEmoji = /\p{Extended_Pictographic}/u.test(query) ? query.trim() : "";

  return (
    <details
      ref={ref}
      className={`relative ${className}`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && window.matchMedia("(pointer: fine)").matches) search.current?.focus();
      }}
    >
      <input type="hidden" name={name} value={value} />
      <summary
        aria-label={value ? `${label}: ${value}. Trocar` : `Escolher ${label.toLowerCase()}`}
        title="Escolher emoji"
        className="press flex h-[34px] min-w-[3rem] cursor-pointer list-none items-center justify-center rounded-md border border-line bg-panel px-2 text-lg leading-none hover:border-accent focus-visible:border-accent [&::-webkit-details-marker]:hidden"
      >
        {value || <span className="opacity-40 grayscale">{placeholder}</span>}
      </summary>
      <div className="absolute left-0 z-30 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-lg border border-line bg-panel p-2 shadow-xl">
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // não envia o formulário
              const first = typedEmoji || shown[0];
              if (first) pick(first);
            }
          }}
          placeholder="Buscar (ex.: banco, ideia) ou colar"
          aria-label="Buscar emoji"
          className="rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {!query && (
          <div className="flex justify-between" role="tablist" aria-label="Grupos de emoji">
            {GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={group === i}
                title={g.name}
                onClick={() => setGroup(i)}
                className={`rounded-md px-1.5 py-1 text-base leading-none transition ${group === i ? "bg-surface" : "opacity-60 hover:opacity-100"}`}
              >
                {g.icon}
              </button>
            ))}
          </div>
        )}
        <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain">
          {typedEmoji && !shown.includes(typedEmoji) && (
            <button type="button" onClick={() => pick(typedEmoji)} className="rounded-md p-1 text-xl leading-none hover:bg-surface" title="Usar este">
              {typedEmoji}
            </button>
          )}
          {shown.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              aria-label={e}
              className={`rounded-md p-1 text-xl leading-none hover:bg-surface ${value === e ? "bg-accent/15 ring-1 ring-accent" : ""}`}
            >
              {e}
            </button>
          ))}
          {!shown.length && !typedEmoji && <p className="col-span-8 px-1 py-2 text-xs text-faint">Nada encontrado. Dá para colar qualquer emoji na busca.</p>}
        </div>
        {value && (
          <button type="button" onClick={() => pick("")} className="self-start text-xs text-muted hover:text-ink hover:underline">
            Remover emoji
          </button>
        )}
      </div>
    </details>
  );
}
