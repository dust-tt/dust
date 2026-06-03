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
  Trash01V2,
} from "@dust-tt/sparkle";
import { type ChangeEvent, useCallback, useState } from "react";

interface DeletePodDialogProps {
  owner: LightWorkspaceType;
  pod: PodType;
}

export function DeletePodDialog({ owner, pod }: DeletePodDialogProps) {
  const router = useAppRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
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
          <Button icon={Trash01V2} variant="warning" label="Delete Pod" />
        </div>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`Delete ${pod.name}?`}</DialogTitle>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Type <strong>delete</strong> below to confirm. This permanently
                removes all Pod content and cannot be undone.
              </p>
              <Input
                name="delete-confirm"
                value={confirmText}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setConfirmText(e.target.value)
                }
                placeholder="Type delete to confirm"
                containerClassName="w-full"
              />
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete permanently",
                variant: "warning",
                disabled: confirmText.trim().toLowerCase() !== "delete",
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
