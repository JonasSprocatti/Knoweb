import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { aiProvider } from "@/lib/server/gemini";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Shell email={user.email ?? ""} ai={process.env.GEMINI_API_KEY ? await aiProvider() : null}>{children}</Shell>;
}
