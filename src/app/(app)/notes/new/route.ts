import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Atalho do app instalado ("Nova nota"): cria uma nota vazia e abre para edição. */
export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data } = await supabase.from("notes").insert({}).select("id").single();
  return NextResponse.redirect(new URL(data ? `/notes/${data.id}?edit=1` : "/notes", request.url));
}
