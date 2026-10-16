/** Aparece na hora em que você toca num link, enquanto o servidor monta a tela. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5" aria-busy="true" aria-label="Carregando">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-full max-w-md" />
      <div className="mt-2 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 w-full" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}
