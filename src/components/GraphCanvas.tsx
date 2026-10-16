"use client";

import ForceGraph2D from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import { useEffect, type MutableRefObject } from "react";

/**
 * Wrapper fino: o next/dynamic não repassa `ref`, então o ref do grafo
 * (usado para centralizar/zoom) vai como prop comum.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function GraphCanvas({ fgRef, ...props }: { fgRef: MutableRefObject<any> } & Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Graph = ForceGraph2D as unknown as React.ComponentType<any>;
  // Gravidade leve para o centro: pontos soltos ficam por perto em vez de fugir da tela;
  // repulsão um pouco maior separa os rótulos do miolo
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("x", forceX(0).strength(0.07));
    fg.d3Force("y", forceY(0).strength(0.07));
    fg.d3Force("charge")?.strength(-70);
    fg.d3Force("link")?.distance(34);
    fg.d3ReheatSimulation?.();
  }, [fgRef]);
  return <Graph ref={fgRef} {...props} />;
}
