import { NextResponse } from "next/server";

export const unauthorized = () => NextResponse.json({ error: "Faça login." }, { status: 401 });
export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const serverError = (err: unknown) =>
  NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
