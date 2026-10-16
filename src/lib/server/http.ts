import { NextResponse } from "next/server";

export const unauthorized = () => NextResponse.json({ error: "Faça login." }, { status: 401 });
export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const serverError = (err: unknown) => {
  console.error(err); // fica no log da Vercel para auditoria
  const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
};
