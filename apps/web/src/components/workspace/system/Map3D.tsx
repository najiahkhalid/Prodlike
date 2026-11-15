'use client';

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Mesh, MeshStandardMaterial } from 'three';
import type { EngineSnapshot, NodeState } from '@prodlike/shared';
import { STATE_STYLE } from './states';

/** One service as a block. Colour AND a label with icon show its state (NFR-07); down/deploying pulse. */
function NodeBlock({
  position,
  label,
  state,
  kind,
}: {
  position: [number, number, number];
  label: string;
  state: NodeState;
  kind: string;
}) {
  const mesh = useRef<Mesh>(null);
  const style = STATE_STYLE[state];
  const height = kind === 'database' ? 0.5 : kind === 'external' ? 0.35 : 0.7;

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const mat = m.material as MeshStandardMaterial;
    const pulse = state === 'down' || state === 'deploying';
    mat.emissiveIntensity = pulse ? 0.35 + 0.35 * Math.sin(clock.elapsedTime * 5) : 0.15;
    m.position.y = height / 2 + (state === 'deploying' ? Math.sin(clock.elapsedTime * 4) * 0.05 : 0);
  });

  return (
    <group position={position}>
      <mesh ref={mesh} castShadow>
        {kind === 'database' ? (
          <cylinderGeometry args={[0.42, 0.42, height, 24]} />
        ) : (
          <boxGeometry args={[0.95, height, 0.6]} />
        )}
        <meshStandardMaterial
          color={style.fill}
          emissive={style.colour}
          emissiveIntensity={0.15}
          roughness={0.5}
        />
      </mesh>
      <Html position={[0, -0.05, 0.62]} center distanceFactor={7} zIndexRange={[10, 0]}>
        <div className="pointer-events-none whitespace-nowrap text-center font-body leading-tight">
          <div className="text-[11px] font-semibold text-white">{label}</div>
          <div className="text-[10px] font-semibold" style={{ color: style.colour }}>
            {style.icon} {style.label}
          </div>
        </div>
      </Html>
    </group>
  );
}

function Edge({
  from,
  to,
  hot,
}: {
  from: [number, number, number];
  to: [number, number, number];
  hot: boolean;
}) {
  const mid: [number, number, number] = [(from[0] + to[0]) / 2, 0.02, (from[2] + to[2]) / 2];
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  return (
    <mesh position={mid} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[length, 0.03, 0.05]} />
      <meshBasicMaterial color={hot ? '#F87171' : '#334155'} />
    </mesh>
  );
}

/** Live 3D system map (FR-12). Loaded only in the browser; falls back to 2D without WebGL (NFR-05). */
export default function Map3D({ engine }: { engine: EngineSnapshot }) {
  const positions = useMemo(() => {
    const cx = engine.layout.reduce((a, n) => a + n.x, 0) / engine.layout.length;
    const cy = engine.layout.reduce((a, n) => a + n.y, 0) / engine.layout.length;
    return new Map(
      engine.layout.map((n) => [n.id, [(n.x - cx) * 1.0, 0, (n.y - cy) * 1.25] as [number, number, number]]),
    );
  }, [engine.layout]);

  return (
    <Canvas
      camera={{ position: [0, 7.2, 7.4], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      aria-label="System map, 3D view"
    >
      <color attach="background" args={['#0B1120']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 5]} intensity={1.1} />
      <gridHelper args={[14, 14, '#1E293B', '#1E293B']} />
      {engine.edges.map(([a, b]) => (
        <Edge
          key={`${a}-${b}`}
          from={positions.get(a)!}
          to={positions.get(b)!}
          hot={[a, b].some((id) => engine.nodes[id] === 'down' || engine.nodes[id] === 'degraded')}
        />
      ))}
      {engine.layout.map((n) => (
        <NodeBlock
          key={n.id}
          position={positions.get(n.id)!}
          label={n.label}
          kind={n.kind}
          state={engine.nodes[n.id] ?? 'healthy'}
        />
      ))}
      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} maxPolarAngle={Math.PI / 2.4} />
    </Canvas>
  );
}
