import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { Avatar, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

const CARTOGRAPHY_HEIGHT = 600;

interface CartographyProps {
  agentConfigurations: LightAgentConfigurationType[];
  isLoading: boolean;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

interface CartographyPoint {
  x: number;
  y: number;
  agent: LightAgentConfigurationType;
}

// Deterministic string hash (djb2) so a given agent always maps to the same
// seed, keeping its coordinates stable across re-renders.
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

// Mulberry32 PRNG: turns a 32-bit seed into a deterministic float in [0, 1).
function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface AgentPointShapeProps {
  cx?: number;
  cy?: number;
  payload?: CartographyPoint;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

function AgentPointShape({
  cx,
  cy,
  payload,
  onAgentClick,
}: AgentPointShapeProps) {
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  const { agent } = payload;
  const width = 96;
  const height = 64;

  return (
    <foreignObject
      x={cx - width / 2}
      y={cy - height / 2}
      width={width}
      height={height}
      className="overflow-visible"
    >
      <button
        type="button"
        onClick={() => onAgentClick(agent)}
        className="flex w-full cursor-pointer flex-col items-center gap-1 focus:outline-none"
      >
        <Avatar size="sm" visual={agent.pictureUrl} />
        <span className="max-w-full truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
          {agent.name}
        </span>
      </button>
    </foreignObject>
  );
}

export function Cartography({
  agentConfigurations,
  isLoading,
  onAgentClick,
}: CartographyProps) {
  const points = useMemo<CartographyPoint[]>(
    () =>
      agentConfigurations
        // Only plot agents the user created/can edit, excluding the base
        // Dust agents (scope "global", never editable).
        .filter((agent) => agent.canEdit)
        .map((agent) => {
          const seed = hashString(agent.sId);
          return {
            x: seededRandom(seed),
            y: seededRandom(seed ^ 0x9e3779b9),
            agent,
          };
        }),
    [agentConfigurations]
  );

  if (isLoading || points.length === 0) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{ height: CARTOGRAPHY_HEIGHT }}
      >
        {isLoading ? (
          <Spinner size="lg" />
        ) : (
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No agents to display.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 w-full">
      <span className="heading-base">Cartography</span>
      <ResponsiveContainer width="100%" height={CARTOGRAPHY_HEIGHT}>
        <ScatterChart margin={{ top: 24, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid className="stroke-border" />
          <XAxis type="number" dataKey="x" domain={[0, 1]} hide />
          <YAxis type="number" dataKey="y" domain={[0, 1]} hide />
          <Scatter
            data={points}
            isAnimationActive={false}
            shape={<AgentPointShape onAgentClick={onAgentClick} />}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
