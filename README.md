# Knoweb

Um meio-termo entre Notion e Obsidian: você grava conversas (no PC ou no celular), escreve notas em markdown, e o Claude resume, separa os temas e liga tudo numa teia de conhecimento que você navega por grafo, por tema ou perguntando.

- **Gravar** no navegador do desktop ou do celular. O áudio sobe em pedaços de 5 min e é transcrito pelo Whisper enquanto você ainda fala.
- **Escrever** notas em markdown, com `[[links]]` no estilo Obsidian (autocompleta ao digitar `[[`) e backlinks.
- **Analisar com o Claude**: título, resumo, pontos-chave, próximos passos, decisões, pessoas, temas e notas relacionadas. Roda sozinho no fim de cada gravação.
- **Navegar** pela teia (grafo interativo), pelos temas, pela busca de texto completo ou perguntando ao Claude com citações das suas notas.
- **Sincronizado** entre dispositivos (Supabase, com atualização em tempo real) e instalável na tela inicial do celular.
- **Exporta** cada nota como `.md` com frontmatter, pronto para abrir no Obsidian.

## Stack

| Parte | Tecnologia |
|---|---|
| App | Next.js 15 (App Router) + React 19 + Tailwind 4 |
| Banco, login, arquivos, tempo real | Supabase (Postgres + Auth + Storage + Realtime) |
| Transcrição | OpenAI Whisper (`whisper-1`) |
| Análise e perguntas | Claude (API da Anthropic) |
| Hospedagem | Vercel |

## Como funciona

```
Navegador (PC/celular)
  ├─ MediaRecorder grava em pedaços de 5 min
  ├─ cada pedaço sobe direto para o Supabase Storage  (não passa pela Vercel)
  └─ POST /api/transcribe ──► Whisper ──► texto com marcas de tempo
                                   │
          quando o último pedaço termina
                                   ▼
                        /api/analyze ──► Claude
                         resumo · tarefas · decisões · temas · notas relacionadas
                                   ▼
                  Postgres (notes, topics, note_topics, note_links)
                                   ▼
          Realtime avisa as telas abertas (PC e celular atualizam sozinhos)
```

A transcrição fica num campo separado (`notes.transcript`), mantido pelo servidor. O que você escreve fica em `notes.content`. Assim, editar a nota durante ou depois da gravação nunca apaga a transcrição.

## Instalação

Pré-requisitos: Node.js 20 ou mais novo, e contas no Supabase, na Anthropic e na OpenAI.

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e rode. Ele cria as tabelas, a busca em português, as regras de segurança (cada usuário só vê o que é seu), o bucket privado `audio` e liga o tempo real. Pode rodar de novo sem problema.
3. Em **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (troque pela URL da Vercel depois do deploy).
   - **Redirect URLs**: adicione `http://localhost:3000/**` e, depois, `https://SEU-APP.vercel.app/**`.
4. Opcional, para uso só seu: em **Authentication → Providers → Email**, desligue "Confirm email" para entrar logo após criar a conta. Depois de criar a sua conta, você pode desligar novos cadastros em **Authentication → Sign In / Providers**.
5. Copie a **Project URL** e a **anon public key** em **Project Settings → API**.

### 2. Chaves de API

- Claude: crie uma chave em [console.anthropic.com](https://console.anthropic.com).
- Whisper: crie uma chave em [platform.openai.com](https://platform.openai.com/api-keys).

### 3. Rodar localmente

```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev
```

Abra `http://localhost:3000`, crie sua conta e grave algo.

> O microfone só funciona em `localhost` ou em HTTPS. Para testar no celular antes do deploy, use o deploy da Vercel (o mais simples) ou um túnel HTTPS.

### 4. Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Add New → Project**, importe o repositório.
3. Em **Environment Variables**, cadastre as mesmas variáveis do `.env.local`.
4. Deploy. Depois, coloque a URL gerada no **Site URL** e nas **Redirect URLs** do Supabase (passo 1.3).

As rotas de transcrição e análise pedem até 300 s de execução (`maxDuration`). Isso funciona no plano gratuito da Vercel com Fluid Compute, que é o padrão em projetos novos.

### 5. Instalar no celular

- **iPhone**: abra o site no Safari → Compartilhar → **Adicionar à Tela de Início**.
- **Android**: abra no Chrome → menu → **Instalar app**.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon) do Supabase |
| `ANTHROPIC_API_KEY` | Chave da API do Claude |
| `ANTHROPIC_MODEL` | Modelo usado (padrão `claude-sonnet-5-5`; use `claude-haiku-5-5` para economizar ou `claude-opus-5-5` para análises mais profundas) |
| `OPENAI_API_KEY` | Chave da OpenAI para o Whisper |
| `OPENAI_TRANSCRIBE_MODEL` | Padrão `whisper-1` (o único que devolve marcas de tempo por trecho) |
| `TRANSCRIBE_LANGUAGE` | Idioma das gravações, padrão `pt` |
| `GEMINI_API_KEY` | Chave do Gemini ([aistudio.google.com](https://aistudio.google.com), tem plano gratuito). Com o seletor em "Gemini", ele transcreve, analisa e responde no lugar de Claude + Whisper |
| `GEMINI_MODEL` | Padrão `gemini-2.5-flash` |
| `AI_PROVIDER` | `claude` ou `gemini`: o padrão enquanto o seletor do app não foi usado |

O app não usa a `service_role` do Supabase: todas as rotas agem como o usuário logado, e o Postgres garante o isolamento pelas regras de RLS.

## Uso

- **Início**: captura rápida de texto, notas fixadas e recentes, temas mais usados e próximos passos extraídos das últimas conversas.
- **Gravar**: botão vermelho. Dá para pausar, escrever anotações enquanto grava e acompanhar a transcrição ao vivo. Também aceita enviar um arquivo de áudio pronto (até 25 MB).
- **Nota**: alterna entre *Ler* e *Editar*. O painel lateral mostra a análise do Claude, os temas (adicione ou remova à mão), as notas relacionadas pelo Claude, os seus links e quem menciona esta nota. Na transcrição, clique numa marca de tempo para ouvir daquele ponto.
- **Temas**: cada tema lista suas notas e os temas que costumam aparecer junto.
- **Teia**: grafo interativo. Laranja são `[[links]]` seus, tracejado verde são ligações sugeridas pelo Claude. Passe o mouse para destacar vizinhos, clique para abrir.
- **Perguntar**: pergunte em linguagem natural; o Claude responde só com base nas suas notas e cita as fontes como `[[links]]` clicáveis.

## Limitações conhecidas

- **Celular com tela bloqueada**: navegadores de celular cortam o microfone quando a tela apaga ou você troca de app. O app pede para manter a tela acesa durante a gravação, mas não deixe o app em segundo plano.
- **Quem falou o quê**: o Whisper não separa falantes, então a transcrição vem como texto corrido com marcas de tempo.
- **Arquivos enviados** precisam ter até 25 MB (limite do Whisper). Gravações feitas pelo app não têm esse limite, porque são quebradas em pedaços.
- **Busca** é por palavras (texto completo em português), não por significado.

## Próximos passos possíveis

- Usar o Gemini (plano gratuito) no lugar de Claude + Whisper. O código já existe (`src/lib/server/gemini.ts`), só está desligado: cadastre `GEMINI_API_KEY` e o seletor Claude/Gemini aparece no app.
- Busca semântica com `pgvector` (embeddings) para o "Perguntar" achar notas por significado.
- Separação de falantes com um serviço de diarização (Deepgram, AssemblyAI).
- Sincronização com um vault do Obsidian (exportar/importar a base inteira como pasta de `.md`).
- Captura offline no celular com envio quando a conexão voltar.

## Estrutura

```
supabase/schema.sql          banco, busca, RLS, storage e realtime
src/middleware.ts            sessão e proteção das páginas
src/app/(app)/               páginas logadas (início, gravar, notas, temas, teia, perguntar, busca)
src/app/api/                 notas, transcrição, análise, perguntas, grafo
src/app/w/[title]/           destino dos [[wikilinks]] (cria a nota se não existir)
src/lib/server/              Claude (análise), Whisper (transcrição), wikilinks
src/components/              gravador, editor, nota, transcrição, grafo, chat
```
