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

// Precomputed [x, y] coordinates keyed by agent sId. Only agents present in
// this map are plotted.
const AGENT_COORDINATES: Record<string, [number, number]> = {
  "Mg2E6Edfow": [
    0.8979972496792902,
    0.24400403916380078
  ],
  "9XD9dibFZG": [
    0.882108756328406,
    0.5093051960701951
  ],
  "ww6gcIDP3E": [
    0.619019443059537,
    0.8085326635967579
  ],
  "U1B3dzDWmP": [
    0.18744480112226222,
    0.027372670671364792
  ],
  "unppcnu4ut": [
    0.08909978971520159,
    0.5730814204909128
  ],
  "OQhuKzqJp0": [
    1,
    0
  ],
  "PYwYFSRQi4": [
    0,
    0.02436148880939058
  ],
  "P3eDG5oH8a": [
    0.5043019870895367,
    0.5987372510462865
  ],
  "GborGtGKEt": [
    0.3988296526222818,
    1
  ]
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
        // Only plot agents that have precomputed coordinates.
        .filter((agent) => AGENT_COORDINATES[agent.sId] !== undefined)
        .map((agent) => {
          const [x, y] = AGENT_COORDINATES[agent.sId];
          return { x, y, agent };
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
        {/*
          Margins reserve room for the point shapes, which are centered on the
          point and extend half their size (48px horizontally, 32px vertically)
          beyond it. Without this, agents at coords near 0 or 1 get clipped.
        */}
        <ScatterChart margin={{ top: 32, right: 48, bottom: 32, left: 48 }}>
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
