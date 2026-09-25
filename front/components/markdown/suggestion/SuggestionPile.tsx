/**
 * Groups the conversational suggestions of one agent message into a single pile: a recap card
 * first, then each pending suggestion one at a time, then a summary once nothing is left to review.
 */

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { getAgentSuggestionLabels } from "@app/components/markdown/suggestion/AgentSuggestionActionCard";
import { DEFAULT_SUGGESTION_VISUAL } from "@app/components/markdown/suggestion/ConversationalSuggestionCard";
import { ConversationalSuggestionReviewCard } from "@app/components/markdown/suggestion/ConversationalSuggestionReviewCard";
import type { SuggestionPileDirective } from "@app/components/markdown/suggestion/suggestion_directives";
import { DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS } from "@app/components/markdown/suggestion/suggestion_directives";
import { getSuggestionStateChip } from "@app/components/skill_builder/SkillSuggestionCard";
import {
  useConversationAgentSuggestionReview,
  useConversationSkillSuggestionReview,
} from "@app/hooks/useConversationalSuggestionReview";
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
import { cloneElement, useState } from "react";

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
  conversationId: string;
  target: Extract<PileTargetDirectives, { type: "agent" }>;
  children: (target: PileTarget) => ReactNode;
}

function AgentPileTarget({
  owner,
  conversationId,
  target,
  children,
}: AgentPileTargetProps) {
  const {
    suggestions,
    agentConfiguration,
    isLoading,
    isAgentConfigurationValidating,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions,
  } = useConversationAgentSuggestionReview({
    workspaceId: owner.sId,
    agentId: target.agentId,
    conversationId,
    skipAgentConfiguration: target.directives.every(({ kind }) =>
      DISABLED_CONVERSATION_AGENT_SUGGESTION_KINDS.includes(kind)
    ),
  });

  const { openPanel } = useConversationSidePanelContext();

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
          <ConversationalSuggestionReviewCard
            target={{ type: "agent", suggestion, agentConfiguration }}
            onAccept={() => void acceptSuggestions([suggestion])}
            onReject={() => void rejectSuggestions([suggestion])}
            onPreview={() =>
              openPanel({
                type: AGENT_SIDE_PANEL_TYPE,
                agentId: target.agentId,
                previewSuggestionIds: [suggestion.sId],
              })
            }
            isAccepting={getPendingAction(suggestion) === "accept"}
            isRejecting={getPendingAction(suggestion) === "reject"}
            // Reviewing against stale agent details would be misleading, so wait for the refresh.
            disabled={isAgentConfigurationValidating}
            {...extras}
          />
        ),
      },
    ];
  });

  const pendingEntries = entries.filter((e) => e.state === "pending");

  return children({
    isLoading,
    isBusy:
      isAgentConfigurationValidating ||
      pendingEntries.some((e) => getPendingAction(e) !== null),
    entries,
    reviewPending: async (decision) => {
      if (pendingEntries.length === 0) {
        return;
      }
      await (decision === "accept"
        ? acceptSuggestions(pendingEntries)
        : rejectSuggestions(pendingEntries));
    },
  });
}

interface SkillPileTargetProps {
  owner: LightWorkspaceType;
  conversationId: string;
  target: Extract<PileTargetDirectives, { type: "skill" }>;
  children: (target: PileTarget) => ReactNode;
}

function SkillPileTarget({
  owner,
  conversationId,
  target,
  children,
}: SkillPileTargetProps) {
  const {
    suggestions,
    skill,
    isLoading,
    getPendingAction,
    acceptSuggestions,
    rejectSuggestions,
  } = useConversationSkillSuggestionReview({
    workspaceId: owner.sId,
    skillId: target.skillId,
    conversationId,
  });

  const { openPanel } = useConversationSidePanelContext();

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
              <ConversationalSuggestionReviewCard
                target={{
                  type: "skill",
                  suggestion,
                  skill,
                  workspaceId: owner.sId,
                }}
                onAccept={() => void acceptSuggestions([suggestion])}
                onReject={() => void rejectSuggestions([suggestion])}
                onPreview={() =>
                  openPanel({
                    type: SKILL_SIDE_PANEL_TYPE,
                    skillId: target.skillId,
                    previewSuggestionIds: [suggestion.sId],
                  })
                }
                isAccepting={getPendingAction(suggestion) === "accept"}
                isRejecting={getPendingAction(suggestion) === "reject"}
                {...extras}
              />
            ),
          },
        ];
      })
    : [];

  const pendingEntries = entries.filter((e) => e.state === "pending");

  return children({
    isLoading,
    isBusy: pendingEntries.some((e) => getPendingAction(e) !== null),
    entries,
    reviewPending: async (decision) => {
      if (pendingEntries.length === 0) {
        return;
      }
      await (decision === "accept"
        ? acceptSuggestions(pendingEntries)
        : rejectSuggestions(pendingEntries));
    },
  });
}

interface PileTargetsLoaderProps {
  owner: LightWorkspaceType;
  conversationId: string;
  targets: PileTargetDirectives[];
  loaded: PileTarget[];
  children: (loaded: PileTarget[]) => ReactNode;
}

// Hooks can't be called in a loop, so each agent or skill gets its own loader component, nested
// one inside the other until every target is available.
function PileTargetsLoader({
  owner,
  conversationId,
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
      conversationId={conversationId}
      targets={targets}
      loaded={[...loaded, pileTarget]}
    >
      {children}
    </PileTargetsLoader>
  );

  return target.type === "agent" ? (
    <AgentPileTarget
      key={target.agentId}
      owner={owner}
      conversationId={conversationId}
      target={target}
    >
      {next}
    </AgentPileTarget>
  ) : (
    <SkillPileTarget
      key={target.skillId}
      owner={owner}
      conversationId={conversationId}
      target={target}
    >
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

  const pendingCards = pendingEntries.map((entry) =>
    entry.renderCard({
      titleAside: `Edit ${entries.indexOf(entry) + 1} of ${entries.length}`,
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
    })
  );

  const summaryCard = (
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

  // The recap card is part of the pile, on top of the pending suggestions.
  const recapCard = (
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
  );

  const cards =
    pendingCards.length === 0
      ? [summaryCard]
      : isReviewing
        ? pendingCards
        : [recapCard, ...pendingCards];

  // Only the front card is interactive; the ones behind it are drawn as decorative layers.
  return <ActionCardStack cardCount={cards.length}>{cards[0]}</ActionCardStack>;
}

interface ConversationSuggestionPileProps {
  owner: LightWorkspaceType;
  conversationId: string;
  directives: SuggestionPileDirective[];
  recap: string | null;
}

export function ConversationSuggestionPile({
  owner,
  conversationId,
  directives: rawDirectives,
  recap,
}: ConversationSuggestionPileProps) {
  // The agent may repeat a directive; each suggestion is reviewed once.
  const directives = rawDirectives.filter(
    (d, index) => rawDirectives.findIndex((o) => o.sId === d.sId) === index
  );

  return (
    <PileTargetsLoader
      owner={owner}
      conversationId={conversationId}
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
