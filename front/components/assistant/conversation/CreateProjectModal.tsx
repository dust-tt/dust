import { useSpaceConversationsSummary } from "@app/hooks/conversations";
import { useAppRouter } from "@app/lib/platform";
import { useCheckProjectName } from "@app/lib/swr/projects";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { getProjectRoute } from "@app/lib/utils/router";
import { areOpenProjectsAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GlobeAltIcon,
  Input,
  Label,
  LockIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  owner: LightWorkspaceType;
}

const OPEN_PROJECTS_DISABLED_TOOLTIP =
  "Open Pods are disabled by your workspace admin.";

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
  owner,
}: CreateProjectModalProps) {
  const areWorkspaceOpenProjectsAllowed = areOpenProjectsAllowed(owner);
  const [projectName, setProjectName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const doCreate = useCreateSpace({ owner });
  const router = useAppRouter();

  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const {
    isNameAvailable,
    isChecking,
    setValue: setNameToCheck,
  } = useCheckProjectName({
    owner,
  });

  useEffect(() => {
    if (isOpen) {
      setProjectName("");
      setIsSaving(false);
      setIsPublic(false);
      setNameToCheck("");
    }
  }, [isOpen, setNameToCheck]);

  useEffect(() => {
    if (!areWorkspaceOpenProjectsAllowed && isPublic) {
      setIsPublic(false);
    }
  }, [areWorkspaceOpenProjectsAllowed, isPublic]);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      setProjectName("");
      setIsSaving(false);
      setIsPublic(false);
      setNameToCheck("");
    }, 500);
  }, [onClose, setNameToCheck]);

  const onSave = useCallback(async () => {
    const trimmedName = projectName.trim();
    if (!trimmedName || !isNameAvailable) {
      return;
    }

    setIsSaving(true);
    const createdSpace = await doCreate(
      {
        name: trimmedName,
        isRestricted: !isPublic,
        managementMode: "manual",
        memberIds: [],
        spaceKind: "project",
      },
      {
        title: "Pod created",
        description: `Pod "${trimmedName}" has been created.`,
      }
    );

    setIsSaving(false);

    if (createdSpace) {
      void mutateSpaceSummary();
      onCreated();
      handleClose();
      void router.push(getProjectRoute(owner.sId, createdSpace.sId));
    }
  }, [
    projectName,
    isNameAvailable,
    isPublic,
    doCreate,
    onCreated,
    handleClose,
    mutateSpaceSummary,
    router,
    owner.sId,
  ]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && projectName.trim() && isNameAvailable) {
        void onSave();
      }
    },
    [onSave, projectName, isNameAvailable]
  );

  const nameNotAvailable =
    projectName.trim() && !isChecking && !isNameAvailable;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Pod</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex w-full flex-col gap-y-4">
            <div className="flex flex-col">
              <Input
                label="Pod name"
                placeholder="Enter Pod name"
                value={projectName}
                name="projectName"
                onChange={(e) => {
                  const newValue = e.target.value;
                  setProjectName(newValue);
                  setNameToCheck(newValue);
                }}
                onKeyDown={handleKeyPress}
                autoFocus
              />
              {nameNotAvailable && (
                <div className="mt-1 text-xs text-warning-500 dark:text-warning-500">
                  A Pod or space with this name already exists.
                </div>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <Label>Visibility</Label>
              <VisibilitySwitch
                isPublic={isPublic}
                disabled={!areWorkspaceOpenProjectsAllowed}
                onChange={setIsPublic}
              />
              <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {isPublic
                  ? "Anyone in the workspace can find and join this Pod."
                  : "Only invited members can access this Pod."}
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button label="Cancel" variant="outline" onClick={handleClose} />
          <Button
            label={isSaving ? "Creating..." : "Create"}
            onClick={onSave}
            disabled={
              !projectName.trim() || isSaving || isChecking || !isNameAvailable
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VisibilitySwitchProps {
  isPublic: boolean;
  disabled: boolean;
  onChange: (isPublic: boolean) => void;
}

function VisibilitySwitch({
  isPublic,
  disabled,
  onChange,
}: VisibilitySwitchProps) {
  const switchList = (
    <ButtonsSwitchList
      size="xs"
      defaultValue={isPublic ? "open" : "restricted"}
      onValueChange={(value) => onChange(value === "open")}
      disabled={disabled}
    >
      <ButtonsSwitch value="open" label="Open" icon={GlobeAltIcon} />
      <ButtonsSwitch value="restricted" label="Restricted" icon={LockIcon} />
    </ButtonsSwitchList>
  );

  if (disabled) {
    return (
      <Tooltip label={OPEN_PROJECTS_DISABLED_TOOLTIP} trigger={switchList} />
    );
  }

  return switchList;
}
