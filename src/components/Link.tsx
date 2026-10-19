"use client";

import NextLink, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentProps } from "react";

/** Enquanto a próxima tela carrega, <html data-nav> acende a barra fina no topo (globals.css). */
function Pending() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    const root = document.documentElement;
    root.dataset.nav = "";
    return () => void delete root.dataset.nav;
  }, [pending]);
  return null;
}

/**
 * next/link que só pré-carrega quando há intenção (mouse por cima, toque, foco).
 * O padrão do Next pré-carrega todo link visível: eram 14–28 chamadas ao servidor
 * por tela, e a fila delas fazia telas levarem 25 s (504) na Vercel.
 */
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, children, ...props }: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  const warm = () => {
    if (prefetch !== false && typeof props.href === "string") router.prefetch(props.href);
  };
  return (
    <NextLink
      {...props}
      prefetch={false}
      onMouseEnter={(e) => (warm(), onMouseEnter?.(e))}
      onTouchStart={(e) => (warm(), onTouchStart?.(e))}
      onFocus={(e) => (warm(), onFocus?.(e))}
    >
      {children}
      <Pending />
    </NextLink>
  );
}
