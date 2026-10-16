import { EntityList } from "@/components/EntityPages";

export const metadata = { title: "Sistemas" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <EntityList kind="system" />;
}
