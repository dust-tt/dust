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

export const WORK_AREA_ACTIONS = [
  {
    label: "Scan my sources",
    message:
      "Before generating a recommendation, re-evaluate my work by scanning my connected sources and personal usage. Allow me to confirm the work areas.",
  },
  {
    label: "Ask me questions",
    message:
      "Before generating a recommendation, learn more about my work by asking me questions, interview style. Allow me to confirm the work areas.",
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

  const confirmed = workAreas.filter((r) => r.status === "confirmed");
  const candidates = workAreas.filter((r) => r.status === "candidate");
  const hasContent = confirmed.length > 0 || candidates.length > 0;

  const handleUpdate = useCallback(
    async (sId: string, status: "confirmed" | "dismissed") => {
      setUpdatingId(sId);
      await updateWorkArea(sId, { status });
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
        What Dust thinks you're responsible for.
      </p>

      <div className="mt-6 border-t border-border">
        {isWorkAreasLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : !hasContent ? (
          <div className="py-4">
            {runningConversation ? (
              <ActivationRunningBanner
                owner={owner}
                runningConversation={runningConversation}
                message="An agent is actively learning about your work."
              />
            ) : (
              <>
                <p className="text-sm leading-5 tracking-tight text-muted-foreground">
                  No work areas yet. Help Dust learn what you own so it can
                  suggest relevant ideas.
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
              </>
            )}
          </div>
        ) : (
          <>
            {confirmed.length > 0 && (
              <div className="flex flex-wrap gap-2 py-4">
                {confirmed.map((r) => (
                  <ConfirmedWorkAreaChip
                    key={r.sId}
                    workArea={r}
                    isUpdating={updatingId === r.sId}
                    onDismiss={() => void handleUpdate(r.sId, "dismissed")}
                  />
                ))}
              </div>
            )}

            {candidates.length > 0 && (
              <div className="divide-y divide-border border-t border-border">
                {candidates.map((r) => (
                  <CandidateWorkAreaRow
                    key={r.sId}
                    workArea={r}
                    isUpdating={updatingId === r.sId}
                    onConfirm={() => void handleUpdate(r.sId, "confirmed")}
                    onDismiss={() => void handleUpdate(r.sId, "dismissed")}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ConfirmedWorkAreaChipProps {
  workArea: ActivationWorkAreaForUserType;
  isUpdating: boolean;
  onDismiss: () => void;
}

function ConfirmedWorkAreaChip({
  workArea,
  isUpdating,
  onDismiss,
}: ConfirmedWorkAreaChipProps) {
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

interface CandidateWorkAreaRowProps {
  workArea: ActivationWorkAreaForUserType;
  isUpdating: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

function CandidateWorkAreaRow({
  workArea,
  isUpdating,
  onConfirm,
  onDismiss,
}: CandidateWorkAreaRowProps) {
  return (
    <div className="py-4">
      <h3 className="text-base font-semibold leading-6 tracking-tight text-foreground">
        {workArea.title}
      </h3>
      <p className="mt-1 text-sm leading-5 tracking-tight text-muted-foreground">
        {workArea.description}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="highlight"
          size="sm"
          isRounded
          label="Confirm"
          disabled={isUpdating}
          onClick={onConfirm}
        />
        <Button
          variant="outline"
          size="sm"
          isRounded
          label="Not Relevant"
          disabled={isUpdating}
          onClick={onDismiss}
        />
        {isUpdating && <Spinner size="xs" />}
      </div>
    </div>
  );
}
