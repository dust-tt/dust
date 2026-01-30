import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceConversationsSummary } from "@app/lib/swr/conversations";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { getSpaceConversationsRoute } from "@app/lib/utils/router";
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
  const [isRestricted, setIsRestricted] = useState(false);

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
      isRestricted,
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
      void router.push(getSpaceConversationsRoute(owner.sId, createdSpace.sId));
    }
  }, [
    projectName,
    isRestricted,
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
          <DialogDescription>
            Unrestricted projects are accessible to all the members of the
            workspace. Restricted projects allow you to control who can access
            them.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex w-full flex-col gap-y-4">
            <Input
              placeholder="Project name"
              value={projectName}
              name="projectName"
              onChange={(e) => {
                setProjectName(e.target.value);
              }}
              onKeyDown={handleKeyPress}
              autoFocus
            />
            <div className="flex w-full items-center justify-between">
              <Label>Restricted Access</Label>
              <SliderToggle
                selected={isRestricted}
                onClick={() => setIsRestricted(!isRestricted)}
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
