import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useCallback, useState } from "react";

import { getSpaceName } from "@app/lib/spaces";
import { useSpaceConversationsSummary } from "@app/lib/swr/conversations";
import { useDeleteSpace } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface DeleteSpaceDialogProps {
  owner: LightWorkspaceType;
  space: SpaceType;
}

export function DeleteSpaceDialog({ owner, space }: DeleteSpaceDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
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
  }, [doDelete, space, mutateSpaceSummary, owner.sId]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex w-full flex-col items-start">
          <Button icon={TrashIcon} variant="warning" label="Delete project" />
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Delete ${getSpaceName(space)}`}</DialogTitle>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to permanently delete project{" "}
                  <strong>{getSpaceName(space)}</strong>? This action cannot be
                  undone.
                </p>
              </div>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
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
