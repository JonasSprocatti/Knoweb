import { EntityDetail } from "@/components/EntityPages";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EntityDetail kind="system" slug={slug} />;
}
