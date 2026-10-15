"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Imagem que aparece no ponto da teia (nota ou tema). Fica no bucket privado "images". */
export function CoverPicker({ table, id, initialPath }: { table: "notes" | "topics"; id: string; initialPath: string | null }) {
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!path) return setPreview(null);
    supabaseBrowser()
      .storage.from("images")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setPreview(data?.signedUrl ?? null));
  }, [path]);

  async function save(file: File | null) {
    setError(null);
    setBusy(true);
    const supabase = supabaseBrowser();
    try {
      let next: string | null = null;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("A imagem passa de 5 MB. Escolha uma menor.");
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error("Sua sessão expirou. Entre de novo.");
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        next = `${auth.user.id}/${table}/${id}-${Date.now()}.${ext}`;
        const { error: up } = await supabase.storage.from("images").upload(next, file, { contentType: file.type });
        if (up) throw up;
      }
      const { error: upd } = await supabase.from(table).update({ cover_path: next }).eq("id", id);
      if (upd) throw upd;
      if (path) await supabase.storage.from("images").remove([path]);
      setPath(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-dashed border-line text-faint transition hover:border-accent hover:text-ink disabled:opacity-50"
        aria-label={path ? "Trocar imagem" : "Escolher imagem"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="text-xl">+</span>}
      </button>
      <div className="text-sm">
        <p className="text-muted">{busy ? "Enviando…" : path ? "Esta imagem aparece no ponto da teia." : "Coloque uma imagem no ponto da teia."}</p>
        {path && !busy && (
          <button type="button" onClick={() => save(null)} className="text-faint underline-offset-2 hover:text-rec hover:underline">
            Remover imagem
          </button>
        )}
        {error && <p className="text-rec">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) save(file);
        }}
      />
    </div>
  );
}
