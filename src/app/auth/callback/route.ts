import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Destino dos links de e-mail (confirmação de conta e link mágico). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
