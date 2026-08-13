import { ActivationRunningBanner } from "@app/components/pages/workspace/GetStartedPage/ActivationRunningBanner";
import { usePodConversations } from "@app/hooks/conversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ActivationWorkAreaForUserType } from "@app/lib/api/activation/work_areas";
import { useAppRouter } from "@app/lib/platform";
import {
  useActivationWorkAreas,
  useUpdateActivationWorkArea,
} from "@app/lib/swr/activation";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button, Chip, Spinner, Tooltip } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

const WORK_AREA_ACTIONS = [
  {
    label: "Scan my sources",
    message:
      "This conversation is to update my work areas, then generate a new idea.\n\n" +
      "1. Re-evaluate my work by scanning my connected sources and personal usage.\n" +
      "2. Present the updated work areas and let me correct them if they're off.\n" +
      "3. Once the work areas are settled, continue the regular flow: set a session goal from the updated work areas and generate a new recommendation (create_recommendation) so it appears on my Get Started page.\n\n" +
      "Do not generate a recommendation until the work areas are settled.",
  },
  {
    label: "Ask me questions",
    message:
      "This conversation is to update my work areas, then generate a new idea.\n\n" +
      "1. Learn more about my work by asking me questions, interview style. Do this before generating a recommendation.\n" +
      "2. Update my work areas based on what I tell you, and let me correct them if they're off.\n" +
      "3. Once the work areas are settled, continue the regular flow: set a session goal from the updated work areas and generate a new recommendation (create_recommendation) so it appears on my Get Started page.\n\n" +
      "Do not generate a recommendation until the work areas are settled.",
  },
] as const;

interface WorkAreaSectionProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string | null;
  defaultAgentId: string | null;
  disabled?: boolean;
}

export function WorkAreaSection({
  owner,
  user,
  podId,
  defaultAgentId,
  disabled,
}: WorkAreaSectionProps) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { workAreas, isWorkAreasLoading, mutateWorkAreas } =
    useActivationWorkAreas({
      workspaceId: owner.sId,
      podId: podId ?? undefined,
      disabled,
    });
  const { conversations } = usePodConversations({
    workspaceId: owner.sId,
    podId,
    options: { disabled },
  });
  const runningConversation =
    conversations.find((conversation) => conversation.isRunningAgentLoop) ??
    null;

  const { updateWorkArea } = useUpdateActivationWorkArea({
    workspaceId: owner.sId,
  });

  const visibleWorkAreas = workAreas.filter((r) => r.status !== "dismissed");
  const hasContent = visibleWorkAreas.length > 0;

  const handleDismiss = useCallback(
    async (sId: string) => {
      setUpdatingId(sId);
      await updateWorkArea(sId, { status: "dismissed" });
      void mutateWorkAreas();
      setUpdatingId(null);
    },
    [updateWorkArea, mutateWorkAreas]
  );

  const startConversation = useCallback(
    async (message: string) => {
      setIsCreating(true);
      const mentions = defaultAgentId
        ? [{ configurationId: defaultAgentId }]
        : [];
      const res = await createConversationWithMessage({
        messageData: {
          input: message,
          mentions,
          contentFragments: { uploaded: [], contentNodes: [] },
        },
        spaceId: podId,
      });
      if (res.isErr()) {
        sendNotification({
          type: "error",
          title: "Couldn't start conversation",
          description: res.error.message,
        });
      } else {
        await router.push(getConversationRoute(owner.sId, res.value.sId));
      }
      setIsCreating(false);
    },
    [
      createConversationWithMessage,
      defaultAgentId,
      podId,
      owner.sId,
      router,
      sendNotification,
    ]
  );

  return (
    <div className="mt-12 rounded-2xl border border-border bg-background px-6 pb-4 pt-6 shadow-sm">
      <h2 className="text-xl font-semibold leading-7 tracking-tight text-foreground">
        Your work
      </h2>
      <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
        What you care about at work. Ideas below are based on this.
      </p>

      <div className="mt-6 border-t border-border">
        {isWorkAreasLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : (
          <div className="py-4">
            {runningConversation && !hasContent && (
              <ActivationRunningBanner
                owner={owner}
                runningConversation={runningConversation}
                message="An agent is actively learning about your work."
              />
            )}
            {hasContent ? (
              <div className="flex flex-wrap gap-2">
                {visibleWorkAreas.map((workArea) => (
                  <WorkAreaChip
                    key={workArea.sId}
                    workArea={workArea}
                    isUpdating={updatingId === workArea.sId}
                    onDismiss={() => void handleDismiss(workArea.sId)}
                  />
                ))}
              </div>
            ) : (
              !runningConversation && (
                <p className="text-sm leading-5 tracking-tight text-muted-foreground">
                  We don't know what you care about yet.
                </p>
              )
            )}
            <p className="mt-4 text-sm leading-5 tracking-tight text-muted-foreground">
              Select an option below to give us feedback. We'll update this and
              suggest a new idea.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {WORK_AREA_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  isRounded
                  label={action.label}
                  disabled={isCreating}
                  onClick={() => void startConversation(action.message)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface WorkAreaChipProps {
  workArea: ActivationWorkAreaForUserType;
  isUpdating: boolean;
  onDismiss: () => void;
}

function WorkAreaChip({ workArea, isUpdating, onDismiss }: WorkAreaChipProps) {
  return (
    <Tooltip
      label={workArea.description}
      trigger={
        <Chip
          label={workArea.title}
          color="highlight"
          size="sm"
          isBusy={isUpdating}
          onRemove={isUpdating ? undefined : onDismiss}
        />
      }
    />
  );
}
