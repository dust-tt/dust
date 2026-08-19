import { labelForKind } from "@app/components/sandbox/env_var_display";
import { Pill } from "@app/components/sandbox/Pill";
import type {
  SandboxEnvVarFormDialogMode,
  SandboxEnvVarPodOption,
} from "@app/components/sandbox/SandboxEnvVarFormDialog";
import { SandboxEnvVarFormDialog } from "@app/components/sandbox/SandboxEnvVarFormDialog";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkDeleteSandboxEnvVar,
  useBulkPodSandboxEnvVars,
  useSandboxEnvVars,
} from "@app/lib/swr/sandbox";
import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Building04,
  Button,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InfoCircle,
  Page,
  PencilLine,
  Plus,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MultiPodEnvVarsSectionProps {
  owner: LightWorkspaceType;
  selection: SandboxPodSelection;
  // The pods `selection` resolves to, for names.
  selectedPods: PodType[];
  // All live pods, for the add dialog's Pod targeting.
  allPods: SandboxEnvVarPodOption[];
  // When true, the Workspace is one of the viewed scopes; workspace-only vars
  // are shown. When false, they are hidden.
  includeWorkspace: boolean;
}

type VariableRow = {
  name: string;
  kind: SandboxEnvVarKind;
  hasWorkspaceVar: boolean;
  // Selected pods carrying a pod-scoped row with this name.
  overriddenInPods: { sId: string; name: string }[];
};

// Values are write-only and never compared; this view shows which scopes
// define each variable and edits it only in the scopes that already do.
export function MultiPodEnvVarsSection({
  owner,
  selection,
  selectedPods,
  allPods,
  includeWorkspace,
}: MultiPodEnvVarsSectionProps) {
  const [dialogMode, setDialogMode] =
    useState<SandboxEnvVarFormDialogMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VariableRow | null>(null);

  const {
    envVars,
    isSandboxEnvVarsLoading,
    isSandboxEnvVarsError,
    mutateSandboxEnvVars,
  } = useSandboxEnvVars({ owner });
  const {
    podEnvVars,
    isPodEnvVarsLoading,
    isPodEnvVarsError,
    mutatePodEnvVars,
  } = useBulkPodSandboxEnvVars({ owner, selection });
  const { bulkDeleteSandboxEnvVar, isBulkDeletingSandboxEnvVar } =
    useBulkDeleteSandboxEnvVar({ owner });

  const podNamesById = useMemo(
    () => new Map(selectedPods.map((pod) => [pod.sId, pod.name])),
    [selectedPods]
  );
  const podById = useMemo(
    () => new Map(selectedPods.map((pod) => [pod.sId, pod])),
    [selectedPods]
  );

  const workspaceEnvVarByName = useMemo(
    () => new Map(envVars.map((envVar) => [envVar.name, envVar])),
    [envVars]
  );
  // One representative pod row per name, for the kind/allowed-domains the
  // override dialog prefills from.
  const podEnvVarByName = useMemo(
    () => new Map(podEnvVars.map((envVar) => [envVar.name, envVar])),
    [podEnvVars]
  );

  const rows = useMemo(() => {
    // Same full name implies same kind: the kind prefix (DST_/DSEC_) is part
    // of the name.
    const rowsByName = new Map<string, VariableRow>();
    for (const envVar of envVars) {
      rowsByName.set(envVar.name, {
        name: envVar.name,
        kind: envVar.kind,
        hasWorkspaceVar: true,
        overriddenInPods: [],
      });
    }
    for (const envVar of podEnvVars) {
      const podName = envVar.spaceId
        ? podNamesById.get(envVar.spaceId)
        : undefined;
      if (!envVar.spaceId || !podName) {
        continue;
      }
      const row = rowsByName.get(envVar.name) ?? {
        name: envVar.name,
        kind: envVar.kind,
        hasWorkspaceVar: false,
        overriddenInPods: [],
      };
      rowsByName.set(row.name, {
        ...row,
        overriddenInPods: [
          ...row.overriddenInPods,
          { sId: envVar.spaceId, name: podName },
        ],
      });
    }
    return [...rowsByName.values()]
      .filter(
        // Hide workspace-only rows when the Workspace is not a viewed scope.
        (row) =>
          includeWorkspace ||
          !row.hasWorkspaceVar ||
          row.overriddenInPods.length > 0
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [envVars, podEnvVars, podNamesById, includeWorkspace]);

  const revalidate = async () => {
    await Promise.all([mutatePodEnvVars(), mutateSandboxEnvVars()]);
  };

  const podTargetingForMode = (mode: SandboxEnvVarFormDialogMode) => {
    if (mode.kind === "create") {
      return {
        pods: allPods,
        initialSelectedPodIds: selectedPods.map((pod) => pod.sId),
      };
    }
    if (mode.kind === "override") {
      const definingIds = podEnvVars
        .filter((envVar) => envVar.name === mode.envVar.name)
        .map((envVar) => envVar.spaceId)
        .filter((sId): sId is string => sId !== null);
      return {
        pods: allPods.filter((pod) => definingIds.includes(pod.sId)),
        initialSelectedPodIds: definingIds,
      };
    }
    return undefined;
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const success = await bulkDeleteSandboxEnvVar({
      name: deleteTarget.name,
      kind: deleteTarget.kind,
      includeWorkspace: includeWorkspace && deleteTarget.hasWorkspaceVar,
      pods: deleteTarget.overriddenInPods,
    });
    setDeleteTarget(null);
    if (success) {
      await revalidate();
    }
  };

  const deleteScopeSummary = deleteTarget
    ? [
        ...(includeWorkspace && deleteTarget.hasWorkspaceVar
          ? ["the Workspace"]
          : []),
        ...deleteTarget.overriddenInPods.map((pod) => pod.name),
      ].join(", ")
    : "";

  const renderBody = () => {
    if (isSandboxEnvVarsLoading || isPodEnvVarsLoading) {
      return <Spinner />;
    }
    if (isSandboxEnvVarsError || isPodEnvVarsError) {
      return (
        <ContentMessage
          variant="warning"
          icon={InfoCircle}
          size="lg"
          title="Failed to load"
        >
          The Computer environment variables could not be loaded.
        </ContentMessage>
      );
    }
    if (rows.length === 0) {
      return (
        <ContentMessage variant="primary" size="lg">
          No environment variables yet.
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-separator">
        {rows.map((row) => {
          const workspaceEnvVar = workspaceEnvVarByName.get(row.name);
          const podEnvVar = podEnvVarByName.get(row.name);
          const canReplaceWorkspace =
            includeWorkspace && row.hasWorkspaceVar && workspaceEnvVar;
          const canReplacePods =
            row.overriddenInPods.length > 0 && podEnvVar !== undefined;
          const scopePills = [
            ...(includeWorkspace && row.hasWorkspaceVar
              ? [{ key: "workspace", label: "Workspace", icon: Building04 }]
              : []),
            ...row.overriddenInPods.map((pod) => {
              const fullPod = podById.get(pod.sId);
              return {
                key: pod.sId,
                label: pod.name,
                icon: fullPod ? getSpaceIcon(fullPod) : undefined,
              };
            }),
          ];
          return (
            <div key={row.name} className="flex items-center gap-3 py-3">
              <div
                title={row.name}
                className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
              >
                <span className="font-mono text-sm text-foreground">
                  {row.name}
                </span>
                <Pill
                  color={row.kind === "https_secret" ? "golden" : "neutral"}
                  label={labelForKind(row.kind)}
                />
                {scopePills.map((pill) => (
                  <Pill
                    key={pill.key}
                    color="blue"
                    label={pill.label}
                    icon={pill.icon}
                  />
                ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="mini"
                    icon={DotsHorizontal}
                    tooltip={`Edit ${row.name}`}
                    className="shrink-0"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canReplaceWorkspace ? (
                    <DropdownMenuItem
                      label="Replace Workspace value"
                      icon={PencilLine}
                      onClick={() =>
                        setDialogMode({
                          kind: "replace",
                          envVar: workspaceEnvVar,
                        })
                      }
                    />
                  ) : null}
                  {canReplacePods ? (
                    <DropdownMenuItem
                      label={`Replace in ${
                        row.overriddenInPods.length === 1
                          ? "1 Pod"
                          : `${row.overriddenInPods.length} Pods`
                      }`}
                      icon={PencilLine}
                      onClick={() =>
                        setDialogMode({ kind: "override", envVar: podEnvVar })
                      }
                    />
                  ) : null}
                  <DropdownMenuItem
                    label="Delete"
                    icon={Trash01}
                    variant="warning"
                    onClick={() => setDeleteTarget(row)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {dialogMode ? (
        <SandboxEnvVarFormDialog
          owner={owner}
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          onSaved={() => void revalidate()}
          existingEnvVars={[]}
          podTargeting={podTargetingForMode(dialogMode)}
        />
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Delete environment variable</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} will be removed from {deleteScopeSummary}.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isBulkDeletingSandboxEnvVar,
            }}
            rightButtonProps={{
              label: "Delete",
              variant: "warning",
              disabled: isBulkDeletingSandboxEnvVar,
              onClick: (event: React.MouseEvent) => {
                event.preventDefault();
                void handleConfirmDelete();
              },
            }}
          />
        </DialogContent>
      </Dialog>

      <Page.Vertical align="stretch" gap="lg">
        <div className="flex flex-col gap-1">
          <div className="heading-base text-foreground">
            Environment variables
          </div>
          <div className="text-sm text-muted-foreground">
            Which scopes define each variable. Values are write-only and never
            shown or compared. Editing a variable only touches the scopes that
            already define it.
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            label="Add variable"
            icon={Plus}
            onClick={() => setDialogMode({ kind: "create" })}
          />
        </div>

        {renderBody()}
      </Page.Vertical>
    </>
  );
}
