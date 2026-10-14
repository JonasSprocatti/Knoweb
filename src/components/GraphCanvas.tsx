"use client";

import ForceGraph2D from "react-force-graph-2d";
import type { MutableRefObject } from "react";

/**
 * Wrapper fino: o next/dynamic não repassa `ref`, então o ref do grafo
 * (usado para centralizar/zoom) vai como prop comum.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function GraphCanvas({ fgRef, ...props }: { fgRef: MutableRefObject<any> } & Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Graph = ForceGraph2D as unknown as React.ComponentType<any>;
  return <Graph ref={fgRef} {...props} />;
}
