import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Recorder } from "@/components/Recorder";

export const metadata = { title: "Gravar" };

export default async function RecordPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Recorder userId={user.id} />;
}
