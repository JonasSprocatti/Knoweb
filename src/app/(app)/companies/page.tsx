import { EntityList } from "@/components/EntityPages";

export const metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <EntityList kind="company" />;
}
