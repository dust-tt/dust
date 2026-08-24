import { ActivationRunningBanner } from "@app/components/activation/ActivationRunningBanner";
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

export interface WorkAreaSectionCopy {
  title: string;
  description: string;
  emptyState: string;
  actionDescription: string;
  runningBanner: string;
}

export interface WorkAreaSectionAction {
  label: string;
  message: string;
}

interface WorkAreaSectionProps {
  owner: WorkspaceType;
  user: UserType | null;
  podId: string | null;
  defaultAgentId: string | null;
  copy: WorkAreaSectionCopy;
  actions: readonly WorkAreaSectionAction[];
  disabled?: boolean;
}

export function WorkAreaSection({
  owner,
  user,
  podId,
  defaultAgentId,
  copy,
  actions,
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
        {copy.title}
      </h2>
      <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
        {copy.description}
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
                message={copy.runningBanner}
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
                  {copy.emptyState}
                </p>
              )
            )}
            <p className="mt-4 text-sm leading-5 tracking-tight text-muted-foreground">
              {copy.actionDescription}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action) => (
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
