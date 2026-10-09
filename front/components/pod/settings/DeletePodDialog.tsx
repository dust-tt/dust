import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { useDeleteSpace } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";

interface DeletePodDialogProps {
  owner: LightWorkspaceType;
  pod: PodType;
}

export function DeletePodDialog({ owner, pod }: DeletePodDialogProps) {
  const { t } = useLingui();
  const podName = pod.name;
  const router = useAppRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmKeyword = t({
    message: "delete",
    context: "keyword the user types to confirm a deletion",
  });
  const doDelete = useDeleteSpace({ owner, force: true });
  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const onDelete = useCallback(async () => {
    setIsDeleting(true);
    const deleted = await doDelete(pod);
    if (deleted) {
      void router.push(getConversationRoute(owner.sId));
      void mutatePodConversationsSummary();
    }
    setIsDeleting(false);
  }, [doDelete, pod, mutatePodConversationsSummary, owner.sId, router]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setConfirmText("");
        }
      }}
    >
      <DialogTrigger asChild>
        <div className="flex w-full flex-col items-start">
          <Button icon={Trash01} variant="warning" label={t`Delete Pod`} />
        </div>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t`Delete ${podName}?`}</DialogTitle>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Type <strong>{confirmKeyword}</strong> below to confirm. This
                  permanently removes all Pod content and cannot be undone.
                </Trans>
              </p>
              <Input
                name="delete-confirm"
                value={confirmText}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setConfirmText(e.target.value)
                }
                placeholder={t`Type ${confirmKeyword} to confirm`}
                containerClassName="w-full"
              />
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
              }}
              rightButtonProps={{
                label: t`Delete permanently`,
                variant: "warning",
                disabled:
                  confirmText.trim().toLowerCase() !==
                  confirmKeyword.toLowerCase(),
                onClick: async () => {
                  void onDelete();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
