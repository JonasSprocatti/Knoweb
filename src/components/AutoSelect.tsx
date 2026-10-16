"use client";

/** <select> que envia o formulário assim que muda (troca de status sem botão). */
export function AutoSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
