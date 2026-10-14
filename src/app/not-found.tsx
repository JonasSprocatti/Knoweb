import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Não encontrado</h1>
      <p className="text-sm text-muted">Essa nota pode ter sido apagada.</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Voltar ao início
      </Link>
    </main>
  );
}
