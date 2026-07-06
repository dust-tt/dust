import { advancedModelKey } from "@app/lib/client/advanced_models";
import {
  useAdvancedModels,
  useGroupAllowedAdvancedModelMutations,
  useGroupAllowedAdvancedModels,
  useUserAllowedAdvancedModelMutations,
  useUserAllowedAdvancedModels,
  useWorkspaceAllowedAdvancedModelMutations,
  useWorkspaceAllowedAdvancedModels,
} from "@app/lib/swr/advanced_models";
import type { AllowedAdvancedModelType } from "@app/types/api/advanced_models";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Avatar,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SettingsList,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

export type EditAdvancedModelsTarget =
  | {
      scope: "user";
      userId: string;
      name: string;
      image: string | null;
    }
  | {
      scope: "group";
      groupId: string;
      name: string;
    }
  | {
      scope: "workspace";
    };

interface EditAdvancedModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  target: EditAdvancedModelsTarget | null;
  readOnly?: boolean;
}

function getDialogTitle(target: EditAdvancedModelsTarget): string {
  switch (target.scope) {
    case "user":
      return `Advanced models for ${target.name}`;
    case "group":
      return `Advanced models for ${target.name}`;
    case "workspace":
      return "Workspace advanced models";
    default:
      return assertNever(target);
  }
}

function getDialogDescription(target: EditAdvancedModelsTarget): string {
  switch (target.scope) {
    case "user":
      return "Choose which advanced models this member can use.";
    case "group":
      return "Choose which advanced models members of this group can use.";
    case "workspace":
      return "Choose which advanced models are available to everyone in this workspace.";
    default:
      return assertNever(target);
  }
}

export function EditAdvancedModelsModal({
  isOpen,
  onClose,
  owner,
  target,
  readOnly = false,
}: EditAdvancedModelsModalProps) {
  const {
    models: advancedModelsCatalog,
    isAdvancedModelsLoading,
    isAdvancedModelsError,
  } = useAdvancedModels({
    owner,
    disabled: !isOpen,
  });

  const {
    users: userAllowedAdvancedModels,
    isUserAllowedAdvancedModelsLoading,
    isUserAllowedAdvancedModelsError,
  } = useUserAllowedAdvancedModels({
    owner,
    disabled: !isOpen || target?.scope !== "user",
  });

  const {
    groups: groupAllowedAdvancedModels,
    isGroupAllowedAdvancedModelsLoading,
    isGroupAllowedAdvancedModelsError,
  } = useGroupAllowedAdvancedModels({
    owner,
    disabled: !isOpen || target?.scope !== "group",
  });

  const {
    models: workspaceAllowedAdvancedModels,
    isWorkspaceAllowedAdvancedModelsLoading,
    isWorkspaceAllowedAdvancedModelsError,
  } = useWorkspaceAllowedAdvancedModels({
    owner,
    disabled: !isOpen || target?.scope !== "workspace",
  });

  const { addUserAllowedAdvancedModel, removeUserAllowedAdvancedModel } =
    useUserAllowedAdvancedModelMutations({ owner });
  const { addGroupAllowedAdvancedModel, removeGroupAllowedAdvancedModel } =
    useGroupAllowedAdvancedModelMutations({ owner });
  const {
    addWorkspaceAllowedAdvancedModel,
    removeWorkspaceAllowedAdvancedModel,
  } = useWorkspaceAllowedAdvancedModelMutations({ owner });

  const [pendingModelKeys, setPendingModelKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const allowedModels = useMemo((): AllowedAdvancedModelType[] => {
    if (!target) {
      return [];
    }
    switch (target.scope) {
      case "user":
        return (
          userAllowedAdvancedModels.find(
            (entry) => entry.userId === target.userId
          )?.models ?? []
        );
      case "group":
        return (
          groupAllowedAdvancedModels.find(
            (entry) => entry.groupId === target.groupId
          )?.models ?? []
        );
      case "workspace":
        return workspaceAllowedAdvancedModels;
      default:
        return assertNever(target);
    }
  }, [
    target,
    userAllowedAdvancedModels,
    groupAllowedAdvancedModels,
    workspaceAllowedAdvancedModels,
  ]);

  const allowedModelKeys = useMemo(
    () => new Set(allowedModels.map(advancedModelKey)),
    [allowedModels]
  );

  const isAllowedLoading = useMemo(() => {
    if (!target) {
      return false;
    }
    switch (target.scope) {
      case "user":
        return isUserAllowedAdvancedModelsLoading;
      case "group":
        return isGroupAllowedAdvancedModelsLoading;
      case "workspace":
        return isWorkspaceAllowedAdvancedModelsLoading;
      default:
        return assertNever(target);
    }
  }, [
    target,
    isUserAllowedAdvancedModelsLoading,
    isGroupAllowedAdvancedModelsLoading,
    isWorkspaceAllowedAdvancedModelsLoading,
  ]);

  const isAllowedError = useMemo(() => {
    if (!target) {
      return false;
    }
    switch (target.scope) {
      case "user":
        return isUserAllowedAdvancedModelsError;
      case "group":
        return isGroupAllowedAdvancedModelsError;
      case "workspace":
        return isWorkspaceAllowedAdvancedModelsError;
      default:
        return assertNever(target);
    }
  }, [
    target,
    isUserAllowedAdvancedModelsError,
    isGroupAllowedAdvancedModelsError,
    isWorkspaceAllowedAdvancedModelsError,
  ]);

  const setModelPending = useCallback(
    (modelKey: string, isPending: boolean) => {
      setPendingModelKeys((prev) => {
        const next = new Set(prev);
        next[isPending ? "add" : "delete"](modelKey);
        return next;
      });
    },
    []
  );

  const handleToggleModel = useCallback(
    async (model: AllowedAdvancedModelType, isAllowed: boolean) => {
      if (!target || readOnly) {
        return;
      }

      const modelKey = advancedModelKey(model);
      setModelPending(modelKey, true);
      try {
        let ok = false;
        switch (target.scope) {
          case "user":
            ok = isAllowed
              ? await addUserAllowedAdvancedModel({
                  userId: target.userId,
                  ...model,
                })
              : await removeUserAllowedAdvancedModel({
                  userId: target.userId,
                  ...model,
                });
            break;
          case "group":
            ok = isAllowed
              ? await addGroupAllowedAdvancedModel({
                  groupId: target.groupId,
                  ...model,
                })
              : await removeGroupAllowedAdvancedModel({
                  groupId: target.groupId,
                  ...model,
                });
            break;
          case "workspace":
            ok = isAllowed
              ? await addWorkspaceAllowedAdvancedModel(model)
              : await removeWorkspaceAllowedAdvancedModel(model);
            break;
          default:
            return assertNever(target);
        }
        if (!ok) {
          return;
        }
      } finally {
        setModelPending(modelKey, false);
      }
    },
    [
      target,
      readOnly,
      addUserAllowedAdvancedModel,
      removeUserAllowedAdvancedModel,
      addGroupAllowedAdvancedModel,
      removeGroupAllowedAdvancedModel,
      addWorkspaceAllowedAdvancedModel,
      removeWorkspaceAllowedAdvancedModel,
      setModelPending,
    ]
  );

  const isLoading = isAdvancedModelsLoading || isAllowedLoading;
  const hasError = isAdvancedModelsError || isAllowedError;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          {target?.scope === "user" ? (
            <div className="flex items-center gap-3">
              <Avatar
                size="sm"
                name={target.name}
                visual={target.image ?? undefined}
              />
              <DialogTitle>{getDialogTitle(target)}</DialogTitle>
            </div>
          ) : (
            <DialogTitle>{target ? getDialogTitle(target) : ""}</DialogTitle>
          )}
        </DialogHeader>
        <DialogContainer>
          {target && (
            <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
              {getDialogDescription(target)}
            </p>
          )}

          {hasError && (
            <ContentMessage
              title="Failed to load advanced models"
              icon={AlertCircle}
              variant="warning"
            >
              An error occurred while loading advanced models. Please try again.
            </ContentMessage>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <SettingsList>
              {advancedModelsCatalog.map((model) => {
                const key = advancedModelKey(model);
                const isAllowed = allowedModelKeys.has(key);
                const isPending = pendingModelKeys.has(key);

                return (
                  <SettingsList.Row
                    key={key}
                    title={model.displayName}
                    description={model.modelId}
                    action={
                      isPending ? (
                        <Spinner size="xs" />
                      ) : (
                        <SliderToggle
                          size="xs"
                          selected={isAllowed}
                          disabled={readOnly}
                          onClick={() =>
                            void handleToggleModel(model, !isAllowed)
                          }
                        />
                      )
                    }
                  />
                );
              })}
            </SettingsList>
          )}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
