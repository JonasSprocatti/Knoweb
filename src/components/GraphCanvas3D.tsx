"use client";

import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { useEffect, type MutableRefObject } from "react";

/** Grafo 3D (three.js), com um céu de estrelas em volta. Carregado só quando o modo 3D é ligado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function GraphCanvas3D({ fgRef, ...props }: { fgRef: MutableRefObject<any> } & Record<string, any>) {
  useEffect(() => {
    const scene = fgRef.current?.scene?.();
    if (!scene) return;
    const positions = new Float32Array(3000 * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - 0.5) * 6000;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdce3ff, size: 2, sizeAttenuation: false }));
    scene.add(stars);
    return () => {
      scene.remove(stars);
      geometry.dispose();
    };
  }, [fgRef]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Graph = ForceGraph3D as unknown as React.ComponentType<any>;
  return (
    <Graph
      ref={fgRef}
      // Ponto com imagem vira um cartão redondo; os outros ficam com a esfera padrão
      nodeThreeObject={(n: { image?: string | null; type: string }) => (n.image ? imageSprite(n.image, n.type === "topic" ? 22 : 12) : null)}
      {...props}
    />
  );
}

const textures = new Map<string, THREE.Texture>();
/** Ponto com imagem vira um "cartão" redondo sempre virado para a câmera. */
function imageSprite(url: string, size: number) {
  let tex = textures.get(url);
  if (!tex) {
    tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.set(url, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaMap: roundMask() }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

let mask: THREE.Texture | null = null;
function roundMask() {
  if (mask) return mask;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(32, 32, 31, 0, Math.PI * 2);
  ctx.fill();
  mask = new THREE.CanvasTexture(c);
  return mask;
}
