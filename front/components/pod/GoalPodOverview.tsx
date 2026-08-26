import { ActivationSurface } from "@app/components/activation/ActivationSurface";
import { JustAskComposer } from "@app/components/activation/JustAskComposer";
import { RecentConversations } from "@app/components/activation/RecentConversations";
import type { RecommendationSectionCopy } from "@app/components/activation/RecommendationSection";
import { RecommendationSection } from "@app/components/activation/RecommendationSection";
import type { WorkAreaSectionCopy } from "@app/components/activation/WorkAreaSection";
import { WorkAreaSection } from "@app/components/activation/WorkAreaSection";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { serializeSkillTag } from "@app/lib/skills/format";
import { usePodMetadata } from "@app/lib/swr/pods";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserType, WorkspaceType } from "@app/types/user";
import { resolveDefaultAgentId } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const GOAL_SKILL_TAG = serializeSkillTag({
  id: "dust_pod_goal",
  name: "Dust Pod Goal",
  icon: "ActionFlagIcon",
});

function withGoalSkill(message: string): string {
  return `${GOAL_SKILL_TAG}\n\n${message}`;
}

const GOAL_WORK_AREA_COPY: WorkAreaSectionCopy = {
  title: "What we're after",
  description:
    "The job this Pod keeps in view. Recommendations below are based on this.",
  emptyState: "Nothing to chase yet.",
  actionDescription:
    "Choose an option below to refine it. The Pod will update this and reconsider the next move.",
  runningBanner: "An agent is reviewing the job this Pod is working on.",
};

const GOAL_WORK_AREA_ACTIONS = [
  {
    label: "Scan sources for progress",
    message:
      "Review the job this Pod is working on against the latest evidence in its connected sources.\n\n" +
      "1. Read the current work areas; that is the job this Pod is working on.\n" +
      "2. Scan connected sources for progress, changes, blockers, and stale assumptions.\n" +
      "3. Update the work areas and let me correct them if needed.\n" +
      "4. Once that job is settled, pick one bounded next action only if it materially advances it, then decide whether Dust or a human should own it.",
  },
  {
    label: "Help me sharpen this",
    message:
      "Help me refine the job this Pod is working on.\n\n" +
      "1. Read the current work areas; that is the job this Pod is working on.\n" +
      "2. Ask focused questions about the work, constraints, progress, and blockers.\n" +
      "3. Update the work areas based on my answers and let me correct them if needed.\n" +
      "4. Once that job is settled, pick one bounded next action only if it materially advances it, then decide whether Dust or a human should own it.",
  },
] as const;

const GOAL_RECOMMENDATION_COPY: RecommendationSectionCopy = {
  title: "What should happen next?",
  description: "This changes as the Pod gathers evidence and makes progress.",
  emptyState: "No evidence-backed action is warranted right now.",
  generateLabel: "Check what matters now",
  runningBanner: "An agent is checking what should happen next?",
};

const GOAL_QUICK_PROMPTS = [
  {
    label: "What should happen next",
    message:
      "Review the job this Pod is working on against the latest available evidence. Diagnose the current constraint, pick one bounded next action, decide whether Dust or a human should own it, and present that move only if it would materially advance the job now.",
  },
  {
    label: "Where are we blocked?",
    message:
      "Review the job this Pod is working on and the current evidence. Identify the most important blocker, if there is one.",
  },
  {
    label: "What evidence are we missing?",
    message:
      "Review the job this Pod is working on and tell me what missing evidence would most improve our next decision.",
  },
] as const;

interface GoalPodOverviewProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string;
}

export function GoalPodOverview({ owner, user, podId }: GoalPodOverviewProps) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const { hasFeature } = useFeatureFlags();
  const { podMetadata } = usePodMetadata({
    workspaceId: owner.sId,
    podId,
  });
  const defaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature: hasFeature("workspace_default_agent"),
  });
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const [isChecking, setIsChecking] = useState(false);

  const startConversation = async (input: string) => {
    setIsChecking(true);
    const result = await createConversationWithMessage({
      messageData: {
        input: withGoalSkill(input),
        mentions: defaultAgentId ? [{ configurationId: defaultAgentId }] : [],
        contentFragments: { uploaded: [], contentNodes: [] },
      },
      spaceId: podId,
    });
    setIsChecking(false);

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Couldn't start the review",
        description: result.error.message,
      });
      return;
    }
    await router.push(getConversationRoute(owner.sId, result.value.sId));
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <ActivationSurface
        highlightedTitle="This Pod has a job to do"
        description={
          <>
            It keeps that job in view and nudges the next useful move when the
            evidence is there.
          </>
        }
      >
        <WorkAreaSection
          owner={owner}
          user={user}
          podId={podId}
          defaultAgentId={defaultAgentId}
          copy={GOAL_WORK_AREA_COPY}
          actions={GOAL_WORK_AREA_ACTIONS}
          skillTag={GOAL_SKILL_TAG}
        />
        <RecommendationSection
          owner={owner}
          podId={podId}
          copy={GOAL_RECOMMENDATION_COPY}
          isGenerating={isChecking}
          onGenerate={() => void startConversation("Check what matters now")}
        />
        <div className="mt-12">
          <h2 className="text-base font-semibold leading-6 tracking-tight text-foreground">
            Or just ask
          </h2>
          <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
            Ask about progress, blockers, evidence, or the next decision.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {GOAL_QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt.label}
                variant="outline"
                size="sm"
                isRounded
                label={prompt.label}
                disabled={isChecking}
                onClick={() => void startConversation(prompt.message)}
              />
            ))}
          </div>
          <div className="mt-4">
            <JustAskComposer
              owner={owner}
              user={user}
              podId={podId}
              defaultAgentId={defaultAgentId}
            />
          </div>
        </div>
        <RecentConversations owner={owner} podId={podId} />
      </ActivationSurface>
    </div>
  );
}
