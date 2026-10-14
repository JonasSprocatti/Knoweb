import { AskView } from "@/components/AskView";

export const metadata = { title: "Perguntar" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <AskView initialQuestion={q ?? ""} />;
}
