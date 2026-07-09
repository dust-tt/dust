import { useAgentCartographyCoordinates } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, SliderToggle, Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
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
  owner: WorkspaceType;
  agentConfigurations: LightAgentConfigurationType[];
  isLoading: boolean;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

interface CartographyPoint {
  x: number;
  y: number;
  agent: LightAgentConfigurationType;
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
  owner,
  agentConfigurations,
  isLoading,
  onAgentClick,
}: CartographyProps) {
  const [includeBuiltin, setIncludeBuiltin] = useState(false);

  const { coordinates, isAgentCartographyCoordinatesLoading } =
    useAgentCartographyCoordinates({
      workspaceId: owner.sId,
      includeBuiltin,
    });

  const points = useMemo<CartographyPoint[]>(
    () =>
      agentConfigurations
        // Only plot agents that have precomputed coordinates.
        .filter((agent) => coordinates[agent.sId] !== undefined)
        .map((agent) => {
          const [x, y] = coordinates[agent.sId];
          return { x, y, agent };
        }),
    [agentConfigurations, coordinates]
  );

  const loading = isLoading || isAgentCartographyCoordinatesLoading;

  return (
    <div className="mt-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <span className="heading-base">Cartography</span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Show builtin agents
          <SliderToggle
            size="xs"
            selected={includeBuiltin}
            onClick={() => setIncludeBuiltin((prev) => !prev)}
          />
        </label>
      </div>
      {loading || points.length === 0 ? (
        <div
          className="flex w-full items-center justify-center"
          style={{ height: CARTOGRAPHY_HEIGHT }}
        >
          {loading ? (
            <Spinner size="lg" />
          ) : (
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              No agents to display.
            </span>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
