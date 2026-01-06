import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { useSpaceConversationsSummary } from "@app/lib/swr/conversations";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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

  const doCreate = useCreateSpace({ owner });
  const { user } = useUser();

  const sendNotification = useSendNotification();

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const hasSpaceConversations = hasFeature("projects");

  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: !hasSpaceConversations },
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
      isRestricted: false,
      managementMode: "manual",
      memberIds: user?.sId ? [user.sId] : [],
      conversationsEnabled: true,
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
    }
  }, [
    projectName,
    doCreate,
    handleClose,
    sendNotification,
    mutateSpaceSummary,
    user,
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
              placeholder="Project name"
              value={projectName}
              name="projectName"
              onChange={(e) => {
                setProjectName(e.target.value);
              }}
              onKeyDown={handleKeyPress}
              autoFocus
            />
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
