import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  ScrollBar,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceViewContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@dust-tt/types";
import React, { useEffect, useState } from "react";

import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces } from "@app/lib/swr/spaces";

interface AddToSpaceDialogProps {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  contentNode: DataSourceViewContentNode;
}

export const AddToSpaceDialog = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  contentNode,
}: AddToSpaceDialogProps) => {
  const [space, setSpace] = useState<SpaceType | undefined>();

  const dataSource = dataSourceView.dataSource;
  const { spaces } = useSpaces({ workspaceId: owner.sId });
  const { dataSourceViews, mutateDataSourceViews } = useDataSourceViews(owner);

  const sendNotification = useSendNotification();

  const allViews = dataSourceViews.filter(
    (dsv) => dsv.dataSource.sId === dataSource.sId && dsv.kind !== "default"
  );

  const alreadyInSpace = allViews
    .filter(
      (dsv) =>
        !contentNode.parentInternalIds ||
        contentNode.parentInternalIds.some(
          (parentId) => !dsv.parentsIn || dsv.parentsIn.includes(parentId)
        )
    )
    .map((dsv) => dsv.spaceId);

  const availableSpaces = spaces.filter((s) => !alreadyInSpace.includes(s.sId));

  useEffect(() => {
    if (isOpen) {
      setSpace(undefined);
    }
  }, [isOpen]);

  const addToSpace = async () => {
    if (!space) {
      return "Please select a space to add the data to.";
    }

    const existingViewForSpace = dataSourceViews.find(
      (d) => d.spaceId === space.sId && d.dataSource.sId === dataSource.sId
    );

    try {
      let res;
      if (existingViewForSpace) {
        res = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/data_source_views/${existingViewForSpace.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              parentsToAdd: [contentNode.internalId],
            }),
          }
        );
      } else {
        res = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/data_source_views`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dataSourceId: dataSource.sId,
              parentsIn: [contentNode.internalId],
            }),
          }
        );
      }

      if (!res.ok) {
        const rawError: { error: APIError } = await res.json();
        sendNotification({
          title: "Error while adding data to space",
          description: rawError.error.message,
          type: "error",
        });
        onClose(false);
      } else {
        sendNotification({
          title: "Data added to space",
          type: "success",
        });
        onClose(true);
        await mutateDataSourceViews();
      }
    } catch (e) {
      sendNotification({
        title: "Error while adding data to space",
        description: `An Unknown error ${e} occurred while adding data to space.`,
        type: "error",
      });
      onClose(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add to Space</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {availableSpaces.length === 0 ? (
            <div className="mt-1 text-left">
              This data is already available in all spaces.
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={space ? space.name : "Select space"}
                  size="sm"
                  isSelect
                  variant="outline"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-48 p-2">
                <ScrollArea
                  className="flex max-h-72 flex-col overflow-y-auto"
                  hideScrollBar
                >
                  {availableSpaces.map((currentSpace) => (
                    <DropdownMenuItem
                      key={currentSpace.sId}
                      label={currentSpace.name}
                      onClick={() => setSpace(currentSpace)}
                    />
                  ))}
                  <ScrollBar className="py-0" />
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: addToSpace,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
