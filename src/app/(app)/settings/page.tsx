import { SettingsView } from "@/components/SettingsView";
import { IndexNotes } from "@/components/IndexNotes";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  analyze: "Análise de notas",
  ask: "Perguntar",
  transcribe: "Transcrição",
  ingest: "Leitura de arquivos",
  versions: "Versões de documentos",
  embed: "Busca por significado",
};
const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: v < 1 ? 3 : 2 });
const tokens = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} mi` : v >= 1_000 ? `${Math.round(v / 1_000)} mil` : String(v));

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  // ponytail: soma no servidor até 10 mil chamadas no mês; acima disso, somar no Postgres (view/rpc)
  const [{ data: rows, error }, { count: unindexed, error: noVectors }] = await Promise.all([
    supabase.from("ai_usage").select("kind, input_tokens, output_tokens, cache_read_tokens, cost_usd").gte("created_at", start.toISOString()).limit(10_000),
    supabase.from("notes").select("id", { count: "exact", head: true }).is("embedding", null).is("merged_into", null),
  ]);

  const byKind = new Map<string, { calls: number; tokens: number; cached: number; cost: number }>();
  for (const r of rows ?? []) {
    const k = byKind.get(r.kind) ?? { calls: 0, tokens: 0, cached: 0, cost: 0 };
    k.calls++;
    k.tokens += r.input_tokens + r.output_tokens + r.cache_read_tokens;
    k.cached += r.cache_read_tokens;
    k.cost += Number(r.cost_usd);
    byKind.set(r.kind, k);
  }
  const total = [...byKind.values()].reduce((s, k) => s + k.cost, 0);
  const month = start.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  return (
    <SettingsView>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Uso das IAs</h2>
        {error ? (
          <p className="-mt-1 text-sm text-muted">Para ver quanto cada parte do app gasta, rode o SQL novo do supabase/schema.sql (Uso das IAs) no Supabase.</p>
        ) : (
          <>
            <p className="-mt-1 text-sm text-muted">
              Estimativa de {month}: <span className="font-semibold text-ink">{usd(total)}</span>. Preços de tabela; a conta real está no painel de cada provedor.
            </p>
            {byKind.size > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line bg-panel">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Para quê</th>
                      <th className="px-3 py-2 text-right font-medium">Chamadas</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens</th>
                      <th className="px-3 py-2 text-right font-medium">Do cache</th>
                      <th className="px-3 py-2 text-right font-medium">Custo</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[...byKind.entries()]
                      .sort((a, b) => b[1].cost - a[1].cost)
                      .map(([kind, k]) => (
                        <tr key={kind} className="border-t border-line">
                          <td className="px-3 py-2 text-ink">{KINDS[kind] ?? kind}</td>
                          <td className="px-3 py-2 text-right text-muted">{k.calls}</td>
                          <td className="px-3 py-2 text-right text-muted">{tokens(k.tokens)}</td>
                          <td className="px-3 py-2 text-right text-muted">{k.tokens ? `${Math.round((k.cached / k.tokens) * 100)}%` : "—"}</td>
                          <td className="px-3 py-2 text-right text-ink">{usd(k.cost)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Busca por significado</h2>
        {noVectors ? (
          <p className="-mt-1 text-sm text-muted">Desligada: rode o SQL novo do supabase/schema.sql (Busca por significado) no Supabase. Enquanto isso, a busca por palavras segue como sempre.</p>
        ) : (
          <>
            <p className="-mt-1 text-sm text-muted">
              O Perguntar acha notas pelo assunto mesmo sem as palavras exatas, e a análise manda ao Claude só os detalhes do que é parecido. Notas novas entram sozinhas ao serem analisadas.
            </p>
            {(unindexed ?? 0) > 0 ? <IndexNotes pending={unindexed ?? 0} /> : <p className="text-sm text-faint">Todas as notas estão indexadas.</p>}
          </>
        )}
      </section>
    </SettingsView>
  );
}
