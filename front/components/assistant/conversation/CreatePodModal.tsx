import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useCheckPodName } from "@app/lib/swr/pods";
import { useCreateSpace } from "@app/lib/swr/spaces";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import type { SpaceType } from "@app/types/space";
import { MAX_POD_NAME_LENGTH } from "@app/types/space";
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
  Globe01,
  Input,
  Label,
  Lock01,
  Tooltip,
} from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

interface CreatePodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pod: SpaceType) => void;
  owner: LightWorkspaceType;
}

const OPEN_PODS_DISABLED_TOOLTIP = msg`Open Pods are disabled by your workspace admin.`;

export function CreatePodModal({
  isOpen,
  onClose,
  onCreated,
  owner,
}: CreatePodModalProps) {
  const { t } = useLingui();
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
        memberIds: [],
        spaceKind: "project",
      },
      {
        title: t`Pod created`,
        description: t`Pod "${trimmedName}" has been created.`,
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
    t,
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
          <DialogTitle>
            <Trans>Create a new Pod</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex w-full flex-col gap-y-4">
            <div className="flex flex-col">
              <Input
                label={t`Pod name`}
                placeholder={t`Enter Pod name`}
                value={podName}
                name="podName"
                maxLength={MAX_POD_NAME_LENGTH}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setPodName(newValue);
                  setNameToCheck(newValue);
                }}
                onKeyDown={handleKeyPress}
                autoFocus
              />
              {nameNotAvailable && (
                <div className="mt-1 text-xs text-warning-500">
                  <Trans>A Pod or space with this name already exists.</Trans>
                </div>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <Label>
                <Trans>Access</Trans>
              </Label>
              <AccessSwitch
                isOpen={isPodOpen}
                disabled={!areWorkspaceOpenPodsAllowed}
                onChange={setIsPodOpen}
              />
              <div className="text-xs text-muted-foreground">
                {isPodOpen
                  ? t`Anyone in the workspace can find and join the Pod.`
                  : t`Only invited members can access the Pod.`}
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button label={t`Cancel`} variant="outline" onClick={handleClose} />
          <Button
            label={isSaving ? t`Creating...` : t`Create`}
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
  const { t } = useLingui();

  const switchList = (
    <ButtonsSwitchList
      size="xs"
      defaultValue={isOpen ? "open" : "restricted"}
      onValueChange={(value) => onChange(value === "open")}
      disabled={disabled}
    >
      <ButtonsSwitch
        value="open"
        label={t({ message: "Open", context: "Pod access level" })}
        icon={Globe01}
      />
      <ButtonsSwitch
        value="restricted"
        label={t({ message: "Restricted", context: "Pod access level" })}
        icon={Lock01}
      />
    </ButtonsSwitchList>
  );

  if (disabled) {
    return (
      <Tooltip label={t(OPEN_PODS_DISABLED_TOOLTIP)} trigger={switchList} />
    );
  }

  return switchList;
}
