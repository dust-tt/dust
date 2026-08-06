import { AssistantLayout } from "@app/components/assistant/AssistantLayout";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { FileDropProvider } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  InputBarContext,
  InputBarProvider,
} from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { getGroupConversationsByDate } from "@app/components/assistant/conversation/utils";
import { usePodConversations } from "@app/hooks/conversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ActivationRecommendationForUserType } from "@app/lib/api/activation/recommendations";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import type { DustError } from "@app/lib/error";
import { useAppRouter } from "@app/lib/platform";
import {
  useActivationPod,
  useActivationRecommendations,
  useUpdateActivationRecommendation,
} from "@app/lib/swr/activation";
import { usePodMetadata } from "@app/lib/swr/pods";
import { timeAgoFrom } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isConnectorProvider } from "@app/types/data_source";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import type { UserType, WorkspaceType } from "@app/types/user";
import { resolveDefaultAgentId } from "@app/types/user";
import {
  ActionBrainIcon,
  ArrowRight,
  Avatar,
  Button,
  ChevronDown,
  ChevronUp,
  cn,
  Folder,
  Icon,
  ListItemSection,
  Spinner,
} from "@dust-tt/sparkle";
import { format } from "date-fns";
import type { ComponentType } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

// Sparkle icons the recommendation source can reference by name (when the
// source is not a data-source connector). Falls back to a folder.
const SPARKLE_ICON_BY_NAME: Record<string, ComponentType> = {
  ActionBrainIcon,
  Folder,
};

// One-tap starters under "Or just ask" — activation-oriented, phrased as things
// the user can ask their learning space to do.
const ASK_SUGGESTIONS = [
  "Scan my connected sources for repetitive work I can automate",
  "Ask me questions to learn how I work",
  "How does my learning space work?",
];

interface SourceIconProps {
  sourceIcon: string;
}

function SourceIcon({ sourceIcon }: SourceIconProps) {
  if (isConnectorProvider(sourceIcon)) {
    const Logo = CONNECTOR_UI_CONFIGURATIONS[sourceIcon].getLogoComponent();
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
        <Logo />
      </span>
    );
  }
  const SparkleIcon = SPARKLE_ICON_BY_NAME[sourceIcon] ?? Folder;
  return (
    <Icon visual={SparkleIcon} size="sm" className="shrink-0 text-faint" />
  );
}

// Recommendations created within the last minute read as "Just now".
const JUST_NOW_THRESHOLD_MS = 60_000;

// Middot separating a recommendation's source label from its relative time
// (e.g. "From your #design channel · 2h ago").
const SOURCE_META_SEPARATOR = "·";

function recencyLabel(createdAtMs: number): string {
  if (Date.now() - createdAtMs < JUST_NOW_THRESHOLD_MS) {
    return "Just now";
  }
  return `${timeAgoFrom(createdAtMs, { useLongFormat: true })} ago`;
}

interface RecommendationItemProps {
  rec: ActivationRecommendationForUserType;
  owner: { sId: string };
  expanded: boolean;
  onToggle: () => void;
  onResolved: () => void;
}

function RecommendationItem({
  rec,
  owner,
  expanded,
  onToggle,
  onResolved,
}: RecommendationItemProps) {
  const router = useAppRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const { updateRecommendation } = useUpdateActivationRecommendation({
    workspaceId: owner.sId,
  });

  // "Create this agent" deep-links into the activation conversation where this
  // recommendation was surfaced; the agent marks it executed once the work
  // actually runs there (via the update_recommendation tool). We don't mark it
  // executed on click — clicking is navigation, not completion.
  const handleCreate = () => {
    void router.push(getConversationRoute(owner.sId, rec.conversationId));
  };

  const handleDismiss = async () => {
    setIsUpdating(true);
    await updateRecommendation(rec.sId, { status: "dismissed" });
    onResolved();
  };

  return (
    <div className="py-6">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          {rec.sourceIcon && <SourceIcon sourceIcon={rec.sourceIcon} />}
          <span className="text-muted-foreground">
            {rec.sourceLabel ?? "Suggested for you"}
          </span>
          <span className="text-faint">
            {SOURCE_META_SEPARATOR} {recencyLabel(rec.createdAt)}
          </span>
        </div>
        <Icon
          visual={expanded ? ChevronUp : ChevronDown}
          size="sm"
          className="shrink-0 text-faint"
        />
      </button>

      <h3 className="mt-2 text-base font-semibold text-foreground">
        {rec.title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{rec.content}</p>

      {expanded && (
        <>
          {rec.body && (
            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {rec.body}
            </p>
          )}

          {rec.steps && rec.steps.length > 0 && (
            <ol className="mt-4 flex flex-col gap-3">
              {rec.steps.map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-dark text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="highlight"
              size="sm"
              isRounded
              label={rec.ctaLabel ?? "Create this agent"}
              iconRight={ArrowRight}
              disabled={isUpdating}
              onClick={handleCreate}
            />
            <Button
              variant="outline"
              size="sm"
              isRounded
              label="Not now"
              disabled={isUpdating}
              onClick={handleDismiss}
            />
            {isUpdating && <Spinner size="xs" />}
          </div>
        </>
      )}
    </div>
  );
}

interface JustAskComposerProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string | null;
  defaultAgentId: string | null;
}

function JustAskComposer({
  owner,
  user,
  podId,
  defaultAgentId,
}: JustAskComposerProps) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const startConversation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      selectedMCPServerViewIds?: string[],
      selectedSpaceIds?: string[],
      modelSelection?: ModelSelectionType
    ): Promise<Result<undefined, DustError>> => {
      const res = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          selectedMCPServerViewIds,
          richMentions: mentions,
          modelSelection,
        },
        spaceId: podId,
        deferMessage: true,
      });

      if (res.isErr()) {
        sendNotification({
          type: "error",
          title: "Couldn't start the conversation",
          description: res.error.message,
        });
        return new Err({
          code: "internal_error",
          name: res.error.title,
          message: res.error.message,
        });
      }

      await router.push(
        getConversationRoute(owner.sId, res.value.sId),
        undefined,
        { shallow: true }
      );
      return new Ok(undefined);
    },
    [createConversationWithMessage, sendNotification, router, owner.sId, podId]
  );

  return (
    <InputBarProvider>
      <FilePreviewProvider owner={owner}>
        <FileDropProvider>
          <GenerationContextProvider>
            {/* Chips live inside the InputBarProvider so they can prefill the
                composer below via shared context. */}
            <AskChips />
            <div className="mt-4">
              <InputBar
                owner={owner}
                user={user}
                onSubmit={startConversation}
                draftKey="get-started-new-conversation"
                disableAutoFocus
                defaultAgentId={defaultAgentId}
                placeholder="Ask your agents anything, or describe a task…"
              />
            </div>
          </GenerationContextProvider>
        </FileDropProvider>
      </FilePreviewProvider>
    </InputBarProvider>
  );
}

function AskChips() {
  const { setPendingInputText } = useContext(InputBarContext);
  return (
    <div className="flex flex-wrap gap-2">
      {ASK_SUGGESTIONS.map((suggestion) => (
        <Button
          key={suggestion}
          variant="outline"
          size="sm"
          isRounded
          label={suggestion}
          onClick={() => setPendingInputText(suggestion, { replace: true })}
        />
      ))}
    </div>
  );
}

interface RecentConversationRowProps {
  conversation: PodConversationListItemType;
  owner: WorkspaceType;
}

function RecentConversationRow({
  conversation,
  owner,
}: RecentConversationRowProps) {
  const router = useAppRouter();
  const unread = conversation.unreadMessageCount > 0;

  return (
    <button
      type="button"
      onClick={() => {
        void router.push(
          getConversationRoute(owner.sId, conversation.id),
          undefined,
          {
            shallow: true,
          }
        );
      }}
      className="flex w-full items-center gap-3 rounded-lg py-2.5 pr-2 text-left hover:bg-muted-background"
    >
      <span
        className={cn(
          "h-8 w-0.5 shrink-0 rounded-full",
          unread ? "bg-highlight" : "bg-transparent"
        )}
      />
      <Avatar
        size="xs"
        name={conversation.creator?.name ?? ""}
        visual={conversation.creator?.visual ?? undefined}
        isRounded
      />
      {conversation.creator?.name && (
        <span className="shrink-0 text-sm text-foreground">
          {conversation.creator.name}
        </span>
      )}
      <span className="shrink-0 text-sm font-semibold text-foreground">
        {conversation.title}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {stripMarkdown(conversation.description ?? "")}
      </span>
      <span className="shrink-0 text-xs text-faint">
        {format(new Date(conversation.updated), "HH:mm")}
      </span>
    </button>
  );
}

interface RecentConversationsProps {
  owner: WorkspaceType;
  podId: string | null;
}

function RecentConversations({ owner, podId }: RecentConversationsProps) {
  const { conversations } = usePodConversations({
    workspaceId: owner.sId,
    podId,
  });

  const grouped = useMemo(
    () => getGroupConversationsByDate({ conversations, titleFilter: "" }),
    [conversations]
  );

  if (conversations.length === 0) {
    return null;
  }

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold text-foreground">
        Recent conversations
      </h2>
      <div className="mt-3">
        {Object.entries(grouped).map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label}>
              <ListItemSection>{label}</ListItemSection>
              <div className="flex flex-col">
                {items
                  .toSorted((a, b) => b.updated - a.updated)
                  .map((c) => (
                    <RecentConversationRow
                      key={c.id}
                      conversation={c}
                      owner={owner}
                    />
                  ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

interface PreviouslyDoneRowProps {
  owner: WorkspaceType;
  podId: string | null;
}

function PreviouslyDoneRow({ owner, podId }: PreviouslyDoneRowProps) {
  const router = useAppRouter();
  const [expanded, setExpanded] = useState(false);
  const { recommendations } = useActivationRecommendations({
    workspaceId: owner.sId,
    podId: podId ?? undefined,
    status: "executed",
  });

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="py-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">
            Previously done
          </span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-highlight-50 px-1.5 text-xs font-medium text-highlight">
            {recommendations.length}
          </span>
        </div>
        <Icon
          visual={expanded ? ChevronUp : ChevronDown}
          size="sm"
          className="shrink-0 text-faint"
        />
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-5">
          {recommendations.map((rec) => (
            <button
              key={rec.sId}
              type="button"
              disabled={!rec.conversationId}
              onClick={() => {
                if (rec.conversationId) {
                  void router.push(
                    getConversationRoute(owner.sId, rec.conversationId),
                    undefined,
                    { shallow: true }
                  );
                }
              }}
              className="flex w-full flex-col gap-1 text-left enabled:hover:opacity-70 disabled:cursor-default"
            >
              <div className="flex items-center gap-2 text-sm">
                {rec.sourceIcon && <SourceIcon sourceIcon={rec.sourceIcon} />}
                <span className="text-muted-foreground">
                  {rec.sourceLabel ?? "Completed"}
                </span>
                <span className="text-faint">
                  {SOURCE_META_SEPARATOR} {recencyLabel(rec.createdAt)}
                </span>
              </div>
              <p className="text-base font-semibold text-foreground">
                {rec.title}
              </p>
              <p className="text-sm text-muted-foreground">{rec.content}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GetStartedPage() {
  const owner = useWorkspace();
  const { user } = useAuth();

  // The whole surface is scoped to the user's activation Pod: recommendations
  // and recent conversations both come from it.
  const { activationPodId, isActivationPodLoading } = useActivationPod({
    workspaceId: owner.sId,
  });

  const { hasFeature } = useFeatureFlags();
  const { podMetadata } = usePodMetadata({
    workspaceId: owner.sId,
    podId: activationPodId,
    disabled: isActivationPodLoading,
  });
  const defaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature: hasFeature("workspace_default_agent"),
  });

  const { recommendations, isRecommendationsLoading, mutateRecommendations } =
    useActivationRecommendations({
      workspaceId: owner.sId,
      podId: activationPodId ?? undefined,
      disabled: isActivationPodLoading,
    });

  // `undefined` = untouched (default to first open, per the design); `null` =
  // user explicitly collapsed everything; string = a specific item is open.
  const [expandedId, setExpandedId] = useState<string | null | undefined>(
    undefined
  );
  const effectiveExpandedId =
    expandedId === undefined ? (recommendations[0]?.sId ?? null) : expandedId;

  const firstName = user?.firstName ?? user?.fullName?.split(" ")[0] ?? "there";

  return (
    <AssistantLayout owner={owner} user={user}>
      <div
        className="min-h-full w-full"
        style={{
          background:
            "radial-gradient(120% 90% at 100% 0%, rgba(28,145,255,0.10) 0%, rgba(28,145,255,0) 45%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-8 py-14 md:px-16">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}.
          </h1>
          <h1 className="text-5xl font-bold tracking-tight text-highlight">
            Let's get started
          </h1>

          <div className="my-6 h-0.5 w-16 rounded-full bg-highlight-200" />

          <p className="text-sm leading-relaxed text-muted-foreground">
            Your own corner of Dust, where your agents and connected tools come
            together.
            <br />
            Nothing here is a demo. It is already wired to how your team works,
            and it is waiting for you.
          </p>

          <div className="mt-10 rounded-2xl border border-border bg-background p-7 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">
              Ideas for right now
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These change as you work. New ones surface as your context shifts.
            </p>

            <div className="mt-6 border-t border-border">
              {isActivationPodLoading || isRecommendationsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="md" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recommendations.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No ideas yet. Start a conversation and Dust will suggest
                      things to try.
                    </p>
                  ) : (
                    recommendations.map((rec) => (
                      <RecommendationItem
                        key={rec.sId}
                        rec={rec}
                        owner={owner}
                        expanded={rec.sId === effectiveExpandedId}
                        onToggle={() =>
                          setExpandedId(
                            rec.sId === effectiveExpandedId ? null : rec.sId
                          )
                        }
                        onResolved={() => void mutateRecommendations()}
                      />
                    ))
                  )}
                  <PreviouslyDoneRow owner={owner} podId={activationPodId} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-xl font-bold text-foreground">Or just ask</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              New here? Try one of these, or just start typing.
            </p>
            <div className="mt-4">
              <JustAskComposer
                owner={owner}
                user={user}
                podId={activationPodId}
                defaultAgentId={defaultAgentId}
              />
            </div>
          </div>

          <RecentConversations owner={owner} podId={activationPodId} />
        </div>
      </div>
    </AssistantLayout>
  );
}
