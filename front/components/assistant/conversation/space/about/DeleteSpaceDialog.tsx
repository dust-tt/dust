import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceName } from "@app/lib/spaces";
import { useDeleteSpace } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
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
  TrashIcon,
} from "@dust-tt/sparkle";
import { type ChangeEvent, useCallback, useState } from "react";

interface DeleteSpaceDialogProps {
  owner: LightWorkspaceType;
  space: SpaceType;
}

export function DeleteSpaceDialog({ owner, space }: DeleteSpaceDialogProps) {
  const router = useAppRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const doDelete = useDeleteSpace({ owner, force: true });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const onDelete = useCallback(async () => {
    setIsDeleting(true);
    const deleted = await doDelete(space);
    if (deleted) {
      void router.push(getConversationRoute(owner.sId));
      void mutateSpaceSummary();
    }
    setIsDeleting(false);
  }, [doDelete, space, mutateSpaceSummary, owner.sId, router]);

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
          <Button icon={TrashIcon} variant="warning" label="Delete project" />
        </div>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`Delete ${getSpaceName(space)}?`}</DialogTitle>
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
                removes all project content and cannot be undone.
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
