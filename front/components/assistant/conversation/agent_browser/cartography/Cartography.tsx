import { DeprecateAgentDialog } from "@app/components/assistant/conversation/agent_browser/cartography/DeprecateAgentDialog";
import { useAgentCartography } from "@app/lib/swr/assistants";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  AgentDuplicatePair,
  DuplicateConfidence,
} from "@app/types/api/assistant/cartography";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionChatBubbleBottomCenterTextIcon,
  ActionMapIcon,
  ActionSquare3Stack3DIcon,
  ActionTimeIcon,
  ActionUserGroupIcon,
  Avatar,
  Button,
  Card,
  CardGrid,
  Chip,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
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

interface ResolvedDuplicatePair {
  first: LightAgentConfigurationType;
  second: LightAgentConfigurationType;
  confidence: DuplicateConfidence;
}

// Lower value = higher confidence, so pairs most likely to be duplicates
// surface first.
const CONFIDENCE_ORDER: Record<DuplicateConfidence, number> = {
  very_high: 0,
  high: 1,
  medium: 2,
};

function confidenceChipProps(confidence: DuplicateConfidence): {
  label: string;
  color: "warning" | "golden" | "info";
} {
  switch (confidence) {
    case "very_high":
      return { label: "Very likely", color: "warning" };
    case "high":
      return { label: "Likely", color: "golden" };
    case "medium":
      return { label: "Possible", color: "info" };
    default:
      return assertNever(confidence);
  }
}

interface AgentMetaLineProps {
  icon: React.ComponentType;
  text: string;
}

function AgentMetaLine({ icon, text }: AgentMetaLineProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground dark:text-muted-foreground-night">
      <Icon visual={icon} size="xs" />
      <span className="truncate">{text}</span>
    </div>
  );
}

interface DuplicateAgentButtonProps {
  agent: LightAgentConfigurationType;
  alternative: LightAgentConfigurationType;
  owner: WorkspaceType;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

function DuplicateAgentButton({
  agent,
  alternative,
  owner,
  onAgentClick,
}: DuplicateAgentButtonProps) {
  const [isDeprecateOpen, setIsDeprecateOpen] = useState(false);

  const messageCount = agent.usage?.messageCount || 0;
  const userCount = agent.usage?.userCount || 0;
  const createdAgo = agent.versionCreatedAt
    ? timeAgoFrom(new Date(agent.versionCreatedAt).getTime(), {
        useLongFormat: true,
      })
    : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-2">
      <button
        type="button"
        onClick={() => onAgentClick(agent)}
        className="flex min-w-0 items-center gap-2 rounded-lg text-left transition-colors hover:bg-muted-background focus:outline-none"
      >
        <Avatar size="sm" visual={agent.pictureUrl} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {agent.name}
        </span>
      </button>
      <div className="flex flex-col gap-1">
        {messageCount !== undefined && (
          <AgentMetaLine
            icon={ActionChatBubbleBottomCenterTextIcon}
            text={`${messageCount} message${pluralize(messageCount)} (30d)`}
          />
        )}
        {userCount !== undefined && (
          <AgentMetaLine
            icon={ActionUserGroupIcon}
            text={`${userCount} user${pluralize(userCount)} (30d)`}
          />
        )}
        {createdAgo && (
          <AgentMetaLine
            icon={ActionTimeIcon}
            text={`Updated ${createdAgo} ago`}
          />
        )}
      </div>
      <Button
        variant="outline"
        size="xs"
        label="Deprecate"
        className="w-full"
        onClick={() => setIsDeprecateOpen(true)}
      />
      <DeprecateAgentDialog
        agent={agent}
        alternative={alternative}
        owner={owner}
        isOpen={isDeprecateOpen}
        onClose={() => setIsDeprecateOpen(false)}
      />
    </div>
  );
}

interface DuplicatePairCardProps {
  pair: ResolvedDuplicatePair;
  owner: WorkspaceType;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

function DuplicatePairCard({
  pair,
  owner,
  onAgentClick,
}: DuplicatePairCardProps) {
  const chip = confidenceChipProps(pair.confidence);

  return (
    <Card variant="secondary" size="md" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
          Possible duplicate
        </span>
        <Chip size="xs" color={chip.color} label={chip.label} />
      </div>
      <div className="flex items-stretch gap-1">
        <DuplicateAgentButton
          agent={pair.first}
          alternative={pair.second}
          owner={owner}
          onAgentClick={onAgentClick}
        />
        <DuplicateAgentButton
          agent={pair.second}
          alternative={pair.first}
          owner={owner}
          onAgentClick={onAgentClick}
        />
      </div>
    </Card>
  );
}

interface DuplicatesSectionProps {
  pairs: ResolvedDuplicatePair[];
  owner: WorkspaceType;
  onAgentClick: (agent: LightAgentConfigurationType) => void;
}

function DuplicatesSection({
  pairs,
  owner,
  onAgentClick,
}: DuplicatesSectionProps) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon
          visual={ActionSquare3Stack3DIcon}
          size="md"
          className="text-foreground"
        />
        <span className="heading-base">Detected duplicates</span>
        <Chip size="xs" color="info" label={pairs.length.toString()} />
      </div>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        These agents look similar based on their configuration. Review them to
        avoid redundancy.
      </p>
      <CardGrid gridClassName="@md:grid-cols-2">
        {pairs.map((pair) => (
          <DuplicatePairCard
            key={`${pair.first.sId}-${pair.second.sId}`}
            pair={pair}
            owner={owner}
            onAgentClick={onAgentClick}
          />
        ))}
      </CardGrid>
    </div>
  );
}

export function Cartography({
  owner,
  agentConfigurations,
  isLoading,
  onAgentClick,
}: CartographyProps) {
  const { coordinates, duplicates, isAgentCartographyLoading } =
    useAgentCartography({
      workspaceId: owner.sId,
      includeBuiltin: false,
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

  const agentsById = useMemo(
    () => new Map(agentConfigurations.map((agent) => [agent.sId, agent])),
    [agentConfigurations]
  );

  const duplicatePairs = useMemo<ResolvedDuplicatePair[]>(
    () =>
      duplicates
        .map((pair: AgentDuplicatePair) => {
          const [firstId, secondId] = pair.agentIds;
          const first = agentsById.get(firstId);
          const second = agentsById.get(secondId);
          // Skip pairs referencing agents that aren't in the current list
          // (e.g. filtered out by the builtin toggle).
          if (!first || !second) {
            return null;
          }
          return { first, second, confidence: pair.confidence };
        })
        .filter((pair): pair is ResolvedDuplicatePair => pair !== null)
        .sort(
          (a, b) =>
            CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]
        ),
    [duplicates, agentsById]
  );

  const loading = isLoading || isAgentCartographyLoading;

  return (
    <div className="mt-6 w-full">
      {!loading && duplicatePairs.length > 0 && (
        <DuplicatesSection
          pairs={duplicatePairs}
          owner={owner}
          onAgentClick={onAgentClick}
        />
      )}
      <div className="mb-3 mt-12 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon visual={ActionMapIcon} size="md" className="text-foreground" />
          <span className="heading-base">Agent map</span>
        </div>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Similar agents are grouped together.
        </p>
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
