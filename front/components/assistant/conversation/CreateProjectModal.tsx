import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceConversationsSummary } from "@app/lib/swr/conversations";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { getProjectRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  owner,
}: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const doCreate = useCreateSpace({ owner });
  const router = useAppRouter();

  const sendNotification = useSendNotification();

  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  useEffect(() => {
    if (isOpen) {
      setProjectName("");
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      setProjectName("");
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      return;
    }

    setIsSaving(true);
    const createdSpace = await doCreate({
      name: trimmedName,
      isRestricted: !isPublic,
      managementMode: "manual",
      memberIds: [],
      spaceKind: "project",
    });

    setIsSaving(false);

    if (createdSpace) {
      void mutateSpaceSummary();
      sendNotification({
        type: "success",
        title: "Project created",
        description: `Project "${trimmedName}" has been created.`,
      });
      handleClose();
      void router.push(getProjectRoute(owner.sId, createdSpace.sId));
    }
  }, [
    projectName,
    isPublic,
    doCreate,
    handleClose,
    sendNotification,
    mutateSpaceSummary,
    router,
    owner.sId,
  ]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && projectName.trim()) {
        void onSave();
      }
    },
    [onSave, projectName]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Project</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex w-full flex-col gap-y-4">
            <Input
              label="Project name"
              placeholder="Enter project name"
              value={projectName}
              name="projectName"
              onChange={(e) => {
                setProjectName(e.target.value);
              }}
              onKeyDown={handleKeyPress}
              autoFocus
            />
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  Opened to everyone
                </div>
                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Anyone in the workspace can find and join the project.
                </div>
              </div>
              <SliderToggle
                size="xs"
                selected={isPublic}
                onClick={() => setIsPublic((prev) => !prev)}
              />
            </div>
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button label="Cancel" variant="outline" onClick={handleClose} />
          <Button
            label={isSaving ? "Creating..." : "Create"}
            onClick={onSave}
            disabled={!projectName.trim() || isSaving}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
