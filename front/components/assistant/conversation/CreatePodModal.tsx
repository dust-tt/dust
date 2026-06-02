import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useCheckPodName } from "@app/lib/swr/pods";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import type { SpaceType } from "@app/types/space";
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

interface CreatePodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pod: SpaceType) => void;
  owner: LightWorkspaceType;
}

const OPEN_PODS_DISABLED_TOOLTIP =
  "Open Pods are disabled by your workspace admin.";

export function CreatePodModal({
  isOpen,
  onClose,
  onCreated,
  owner,
}: CreatePodModalProps) {
  const areWorkspaceOpenPodsAllowed = areOpenPodsAllowed(owner);
  const [podName, setPodName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPodOpen, setIsPodOpen] = useState(false);

  const doCreate = useCreateSpace({ owner });

  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const {
    isNameAvailable,
    isChecking,
    setValue: setNameToCheck,
  } = useCheckPodName({
    owner,
  });

  useEffect(() => {
    if (isOpen) {
      setPodName("");
      setIsSaving(false);
      setIsPodOpen(false);
      setNameToCheck("");
    }
  }, [isOpen, setNameToCheck]);

  useEffect(() => {
    if (!areWorkspaceOpenPodsAllowed && isOpen) {
      setIsPodOpen(false);
    }
  }, [areWorkspaceOpenPodsAllowed, isOpen]);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      setPodName("");
      setIsSaving(false);
      setIsPodOpen(false);
      setNameToCheck("");
    }, 500);
  }, [onClose, setNameToCheck]);

  const onSave = useCallback(async () => {
    const trimmedName = podName.trim();
    if (!trimmedName || !isNameAvailable) {
      return;
    }

    setIsSaving(true);
    const createdSpace = await doCreate(
      {
        name: trimmedName,
        isRestricted: !isPodOpen,
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
      onCreated(createdSpace);
      handleClose();
    }
  }, [
    podName,
    isNameAvailable,
    isPodOpen,
    doCreate,
    onCreated,
    handleClose,
    mutateSpaceSummary,
  ]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && podName.trim() && isNameAvailable) {
        void onSave();
      }
    },
    [onSave, podName, isNameAvailable]
  );

  const nameNotAvailable = podName.trim() && !isChecking && !isNameAvailable;

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
                value={podName}
                name="podName"
                onChange={(e) => {
                  const newValue = e.target.value;
                  setPodName(newValue);
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
              <Label>Access</Label>
              <AccessSwitch
                isOpen={isPodOpen}
                disabled={!areWorkspaceOpenPodsAllowed}
                onChange={setIsPodOpen}
              />
              <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {isPodOpen
                  ? "Anyone in the workspace can find and join the Pod."
                  : "Only invited members can access the Pod."}
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
              !podName.trim() || isSaving || isChecking || !isNameAvailable
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AccessSwitchProps {
  isOpen: boolean;
  disabled: boolean;
  onChange: (isOpen: boolean) => void;
}

function AccessSwitch({ isOpen, disabled, onChange }: AccessSwitchProps) {
  const switchList = (
    <ButtonsSwitchList
      size="xs"
      defaultValue={isOpen ? "open" : "restricted"}
      onValueChange={(value) => onChange(value === "open")}
      disabled={disabled}
    >
      <ButtonsSwitch value="open" label="Open" icon={GlobeAltIcon} />
      <ButtonsSwitch value="restricted" label="Restricted" icon={LockIcon} />
    </ButtonsSwitchList>
  );

  if (disabled) {
    return <Tooltip label={OPEN_PODS_DISABLED_TOOLTIP} trigger={switchList} />;
  }

  return switchList;
}
