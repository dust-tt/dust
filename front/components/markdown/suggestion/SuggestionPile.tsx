/**
 * Groups the conversational suggestions of one agent message into a single pile: a recap card
 * first, then each pending suggestion one at a time, then a summary once nothing is left to review.
 */

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  AgentSuggestionActionCard,
  getAgentSuggestionLabels,
} from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { DEFAULT_SUGGESTION_VISUAL } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import type { SuggestionPileDirective } from "@app/components/markdown/suggestion/suggestion_directives";
import { DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS } from "@app/components/markdown/suggestion/suggestion_directives";
import {
  getSuggestionStateChip,
  SkillSuggestionCard,
} from "@app/components/skill_builder/SkillSuggestionCard";
import {
  useSkillSuggestionReview,
  useSkillSuggestions,
} from "@app/hooks/useSkillSuggestions";
import {
  useAgentSuggestionActions,
  useAgentSuggestions,
} from "@app/lib/swr/agent_suggestions";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSkill } from "@app/lib/swr/skill_configurations";
import {
  AGENT_SIDE_PANEL_TYPE,
  SKILL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionCardStack,
  Avatar,
  Button,
  Card,
  Chip,
  Edit04,
  LoadingBlock,
} from "@dust-tt/sparkle";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, useCallback, useState } from "react";

interface PileCardExtras {
  titleAside: ReactNode;
  secondaryAction: ReactNode;
}

interface PileEntry {
  sId: string;
  state: "pending" | "approved" | "rejected" | "outdated";
  title: string;
  visual: ReactElement<{ size?: string }>;
  renderCard: (extras: PileCardExtras) => ReactNode;
}

// Everything the pile needs from one agent or skill: its suggestions from this message and a way
// to review the pending ones in a single request.
interface PileTarget {
  isLoading: boolean;
  isBusy: boolean;
  entries: PileEntry[];
  reviewPending: (decision: "accept" | "reject") => Promise<void>;
}

type AgentDirective = Extract<SuggestionPileDirective, { type: "agent" }>;
type SkillDirective = Extract<SuggestionPileDirective, { type: "skill" }>;

type PileTargetDirectives =
  | { type: "agent"; agentId: string; directives: AgentDirective[] }
  | { type: "skill"; skillId: string; directives: SkillDirective[] };

function groupByTarget(
  directives: SuggestionPileDirective[]
): PileTargetDirectives[] {
  const byAgent = new Map<string, AgentDirective[]>();
  const bySkill = new Map<string, SkillDirective[]>();
  for (const directive of directives) {
    if (directive.type === "agent") {
      byAgent.set(directive.agentId, [
        ...(byAgent.get(directive.agentId) ?? []),
        directive,
      ]);
    } else {
      bySkill.set(directive.skillId, [
        ...(bySkill.get(directive.skillId) ?? []),
        directive,
      ]);
    }
  }
  return [
    ...[...byAgent].map(
      ([agentId, agentDirectives]): PileTargetDirectives => ({
        type: "agent",
        agentId,
        directives: agentDirectives,
      })
    ),
    ...[...bySkill].map(
      ([skillId, skillDirectives]): PileTargetDirectives => ({
        type: "skill",
        skillId,
        directives: skillDirectives,
      })
    ),
  ];
}

interface AgentPileTargetProps {
  owner: LightWorkspaceType;
  target: Extract<PileTargetDirectives, { type: "agent" }>;
  children: (target: PileTarget) => ReactNode;
}

function AgentPileTarget({ owner, target, children }: AgentPileTargetProps) {
  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useAgentSuggestions({
      agentConfigurationId: target.agentId,
      workspaceId: owner.sId,
    });

  const {
    isSuggestionPending,
    acceptSuggestion,
    rejectSuggestion,
    batchAcceptSuggestions,
    batchRejectSuggestions,
  } = useAgentSuggestionActions({
    agentConfigurationId: target.agentId,
    workspaceId: owner.sId,
    mutateSuggestions,
  });

  const { openPanel } = useConversationSidePanelContext();

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: target.agentId,
    disabled: target.directives.every(({ kind }) =>
      DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(kind)
    ),
  });

  const entries: PileEntry[] = target.directives.flatMap(({ sId, kind }) => {
    const suggestion = suggestions.find((s) => s.sId === sId);
    if (!suggestion || suggestion.kind !== kind) {
      return [];
    }
    return [
      {
        sId,
        state: suggestion.state,
        title: getAgentSuggestionLabels(suggestion).title,
        visual: agentConfiguration?.pictureUrl ? (
          <Avatar visual={agentConfiguration.pictureUrl} size="sm" />
        ) : (
          DEFAULT_SUGGESTION_VISUAL
        ),
        renderCard: (extras: PileCardExtras) => (
          <AgentSuggestionActionCard
            agentSuggestion={suggestion}
            pictureUrl={agentConfiguration?.pictureUrl}
            disabled={isSuggestionPending(suggestion)}
            onAccept={() => void acceptSuggestion(suggestion)}
            onReject={() => void rejectSuggestion(suggestion)}
            onPreview={() =>
              openPanel({
                type: AGENT_SIDE_PANEL_TYPE,
                agentId: target.agentId,
                previewSuggestionIds: [suggestion.sId],
              })
            }
            {...extras}
          />
        ),
      },
    ];
  });

  const pendingEntries = entries.filter((e) => e.state === "pending");

  return children({
    isLoading: isSuggestionsLoading,
    isBusy: pendingEntries.some(isSuggestionPending),
    entries,
    reviewPending: async (decision) => {
      if (pendingEntries.length === 0) {
        return;
      }
      await (decision === "accept"
        ? batchAcceptSuggestions(pendingEntries)
        : batchRejectSuggestions(pendingEntries));
    },
  });
}

interface SkillPileTargetProps {
  owner: LightWorkspaceType;
  target: Extract<PileTargetDirectives, { type: "skill" }>;
  children: (target: PileTarget) => ReactNode;
}

function SkillPileTarget({ owner, target, children }: SkillPileTargetProps) {
  const { suggestions, isSuggestionsLoading, mutateSuggestions } =
    useSkillSuggestions({
      skillId: target.skillId,
      workspaceId: owner.sId,
      sources: ["conversational"],
    });

  const { skill, isSkillLoading, mutateSkillRegardlessOfQueryParams } =
    useSkill({
      workspaceId: owner.sId,
      skillId: target.skillId,
    });

  const { pendingAction, batchAcceptSuggestions, batchRejectSuggestions } =
    useSkillSuggestionReview({
      skillId: target.skillId,
      workspaceId: owner.sId,
      mutateSuggestions,
      onApplied: mutateSkillRegardlessOfQueryParams,
    });

  const { openPanel } = useConversationSidePanelContext();

  const getSkillInstructionsHtml = useCallback(
    () => skill?.instructionsHtml ?? "",
    [skill]
  );
  const getCurrentAgentFacingDescription = useCallback(
    () => skill?.agentFacingDescription ?? "",
    [skill]
  );

  const entries: PileEntry[] = skill
    ? target.directives.flatMap(({ sId }) => {
        const suggestion = suggestions.find((s) => s.sId === sId);
        if (!suggestion) {
          return [];
        }
        return [
          {
            sId,
            state: suggestion.state,
            title: suggestion.title ?? "Suggestion",
            visual: DEFAULT_SUGGESTION_VISUAL,
            renderCard: (extras: PileCardExtras) => (
              <SkillSuggestionCard
                suggestion={suggestion}
                onAccept={(s) => void batchAcceptSuggestions([s])}
                onDecline={(s) => void batchRejectSuggestions([s])}
                onPreview={() =>
                  openPanel({
                    type: SKILL_SIDE_PANEL_TYPE,
                    skillId: target.skillId,
                    previewSuggestionIds: [suggestion.sId],
                  })
                }
                getSkillInstructionsHtml={getSkillInstructionsHtml}
                getCurrentAgentFacingDescription={
                  getCurrentAgentFacingDescription
                }
                workspaceId={owner.sId}
                disabled={pendingAction !== null}
                isAccepting={pendingAction === "accept"}
                isDeclining={pendingAction === "decline"}
                {...extras}
              />
            ),
          },
        ];
      })
    : [];

  const pendingEntries = entries.filter((e) => e.state === "pending");

  return children({
    isLoading: isSuggestionsLoading || isSkillLoading,
    isBusy: pendingAction !== null,
    entries,
    reviewPending: async (decision) => {
      if (pendingEntries.length === 0) {
        return;
      }
      await (decision === "accept"
        ? batchAcceptSuggestions(pendingEntries)
        : batchRejectSuggestions(pendingEntries));
    },
  });
}

interface PileTargetsLoaderProps {
  owner: LightWorkspaceType;
  targets: PileTargetDirectives[];
  loaded: PileTarget[];
  children: (loaded: PileTarget[]) => ReactNode;
}

// Hooks can't be called in a loop, so each agent or skill gets its own loader component, nested
// one inside the other until every target is available.
function PileTargetsLoader({
  owner,
  targets,
  loaded,
  children,
}: PileTargetsLoaderProps) {
  if (loaded.length === targets.length) {
    return children(loaded);
  }

  const target = targets[loaded.length];
  const next = (pileTarget: PileTarget) => (
    <PileTargetsLoader
      owner={owner}
      targets={targets}
      loaded={[...loaded, pileTarget]}
    >
      {children}
    </PileTargetsLoader>
  );

  return target.type === "agent" ? (
    <AgentPileTarget key={target.agentId} owner={owner} target={target}>
      {next}
    </AgentPileTarget>
  ) : (
    <SkillPileTarget key={target.skillId} owner={owner} target={target}>
      {next}
    </SkillPileTarget>
  );
}

function formatEditCount(count: number): string {
  return count === 1 ? "1 edit" : `${count} edits`;
}

// Same text colors as the state chips, so outcome counts read like the chips listed below them.
const OUTCOME_TEXT_CLASS_NAMES: Record<
  NonNullable<ReturnType<typeof getSuggestionStateChip>>["color"],
  string
> = {
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-warning-700",
  primary: "text-primary-700",
};

// E.g. "3 accepted, 1 declined", leaving out outcomes nobody got.
function formatReviewOutcomes(entries: PileEntry[]): ReactNode {
  return (["approved", "rejected", "outdated"] as const)
    .flatMap((state) => {
      const count = entries.filter((e) => e.state === state).length;
      const chip = getSuggestionStateChip(state);
      return count > 0 && chip ? [{ state, count, chip }] : [];
    })
    .map(({ state, count, chip }, index) => (
      <span key={state}>
        {index > 0 && ", "}
        <span className={OUTCOME_TEXT_CLASS_NAMES[chip.color]}>
          {count} {chip.label.toLowerCase()}
        </span>
      </span>
    ));
}

interface SuggestionStateChipProps {
  state: PileEntry["state"];
}

function SuggestionStateChip({ state }: SuggestionStateChipProps) {
  const chip = getSuggestionStateChip(state);
  if (!chip) {
    return null;
  }
  return (
    <Chip
      size="xs"
      color={chip.color}
      icon={chip.icon}
      label={chip.label}
      className="ml-auto shrink-0"
    />
  );
}

interface SuggestionPileSummaryCardProps {
  title: ReactNode;
  /** Summary written by the agent before review; `entries` are listed when missing. */
  recap: string | null;
  entries: PileEntry[];
  /** Always lists `entries` with their review outcome, below the recap if any. */
  showEntryState?: boolean;
  actions?: ReactNode;
}

function SuggestionPileSummaryCard({
  title,
  recap,
  entries,
  showEntryState = false,
  actions,
}: SuggestionPileSummaryCardProps) {
  return (
    <Card
      variant="secondary"
      size="md"
      containerClassName="w-full max-w-lg"
      className="flex flex-col gap-4 shadow"
    >
      <div className="flex items-center gap-2">
        <Avatar icon={Edit04} size="sm" backgroundColor="bg-muted-background" />
        <span className="heading-base text-foreground">{title}</span>
      </div>
      {recap && <p className="text-sm text-muted-foreground">{recap}</p>}
      {(!recap || showEntryState) && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.sId} className="flex min-w-0 items-center gap-2">
              {cloneElement(entry.visual, { size: "xs" })}
              <span className="truncate text-sm text-muted-foreground">
                {entry.title}
              </span>
              {showEntryState && <SuggestionStateChip state={entry.state} />}
            </li>
          ))}
        </ul>
      )}
      {actions}
    </Card>
  );
}

interface SuggestionPileRecapActionsProps {
  isBusy: boolean;
  bulkDecision: "accept" | "reject" | null;
  onReview: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function SuggestionPileRecapActions({
  isBusy,
  bulkDecision,
  onReview,
  onAcceptAll,
  onRejectAll,
}: SuggestionPileRecapActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost-secondary"
        size="sm"
        label="Reject all"
        onClick={onRejectAll}
        disabled={isBusy}
        isLoading={bulkDecision === "reject"}
      />
      <div className="ml-auto flex gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Accept all"
          onClick={onAcceptAll}
          disabled={isBusy}
          isLoading={bulkDecision === "accept"}
        />
        <Button
          variant="highlight"
          size="sm"
          label="Review"
          onClick={onReview}
          disabled={isBusy}
        />
      </div>
    </div>
  );
}

interface SuggestionPileViewProps {
  directives: SuggestionPileDirective[];
  recap: string | null;
  targets: PileTarget[];
}

/**
 * @cc [owner:avervaet,label:product] bulk-review-pending-only
 * "Accept all", "Reject all" and "Accept remaining" MUST only review suggestions of this pile that
 * are still pending, and MUST leave a suggestion pending when its review request fails.
 */
function SuggestionPileView({
  directives,
  recap,
  targets,
}: SuggestionPileViewProps) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [bulkDecision, setBulkDecision] = useState<"accept" | "reject" | null>(
    null
  );

  if (targets.some((t) => t.isLoading)) {
    return <LoadingBlock className="h-24 w-full max-w-lg" />;
  }

  const entriesById = new Map(
    targets.flatMap((t) => t.entries).map((e) => [e.sId, e])
  );
  const entries = directives.flatMap((d) => entriesById.get(d.sId) ?? []);
  if (entries.length === 0) {
    return null;
  }

  const pendingEntries = entries.filter((e) => e.state === "pending");
  const isBusy = bulkDecision !== null || targets.some((t) => t.isBusy);

  const reviewAll = async (decision: "accept" | "reject") => {
    setBulkDecision(decision);
    try {
      for (const target of targets) {
        await target.reviewPending(decision);
      }
    } finally {
      setBulkDecision(null);
    }
  };

  if (pendingEntries.length === 0) {
    return (
      <SuggestionPileSummaryCard
        title={
          <>
            {formatEditCount(entries.length)} reviewed ·{" "}
            {formatReviewOutcomes(entries)}
          </>
        }
        recap={recap}
        entries={entries}
        showEntryState
      />
    );
  }

  if (!isReviewing) {
    return (
      // The recap card is part of the pile, on top of the pending suggestions.
      <ActionCardStack cardCount={pendingEntries.length + 1}>
        <SuggestionPileSummaryCard
          title={`${formatEditCount(pendingEntries.length)} ready for your review`}
          recap={recap}
          entries={pendingEntries}
          actions={
            <SuggestionPileRecapActions
              isBusy={isBusy}
              bulkDecision={bulkDecision}
              onReview={() => setIsReviewing(true)}
              onAcceptAll={() => void reviewAll("accept")}
              onRejectAll={() => void reviewAll("reject")}
            />
          }
        />
      </ActionCardStack>
    );
  }

  const [current] = pendingEntries;
  return (
    <ActionCardStack key={current.sId} cardCount={pendingEntries.length}>
      {current.renderCard({
        titleAside: `Edit ${entries.indexOf(current) + 1} of ${entries.length}`,
        secondaryAction: (
          <Button
            variant="ghost-secondary"
            size="sm"
            label="Accept remaining"
            onClick={() => void reviewAll("accept")}
            disabled={isBusy}
            isLoading={bulkDecision === "accept"}
          />
        ),
      })}
    </ActionCardStack>
  );
}

interface ConversationSuggestionPileProps {
  owner: LightWorkspaceType;
  directives: SuggestionPileDirective[];
  recap: string | null;
}

export function ConversationSuggestionPile({
  owner,
  directives,
  recap,
}: ConversationSuggestionPileProps) {
  return (
    <PileTargetsLoader
      owner={owner}
      targets={groupByTarget(directives)}
      loaded={[]}
    >
      {(targets) => (
        <SuggestionPileView
          directives={directives}
          recap={recap}
          targets={targets}
        />
      )}
    </PileTargetsLoader>
  );
}
