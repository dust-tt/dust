import { labelForKind } from "@app/components/sandbox/env_var_display";
import type {
  SandboxEnvVarFormDialogMode,
  SandboxEnvVarPodOption,
} from "@app/components/sandbox/SandboxEnvVarFormDialog";
import { SandboxEnvVarFormDialog } from "@app/components/sandbox/SandboxEnvVarFormDialog";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkPodSandboxEnvVars,
  useSandboxEnvVars,
} from "@app/lib/swr/sandbox";
import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  InfoCircle,
  Page,
  Plus,
  Spinner,
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
  // Names of selected pods carrying a pod-scoped row with this name.
  overriddenInPodNames: string[];
};

// Values are write-only and never compared; this view only shows which scopes
// define each variable.
export function MultiPodEnvVarsSection({
  owner,
  selection,
  selectedPods,
  allPods,
  includeWorkspace,
}: MultiPodEnvVarsSectionProps) {
  const [dialogMode, setDialogMode] =
    useState<SandboxEnvVarFormDialogMode | null>(null);

  const { envVars, isSandboxEnvVarsLoading, isSandboxEnvVarsError } =
    useSandboxEnvVars({ owner });
  const {
    podEnvVars,
    isPodEnvVarsLoading,
    isPodEnvVarsError,
    mutatePodEnvVars,
  } = useBulkPodSandboxEnvVars({ owner, selection });

  const podNamesById = useMemo(
    () => new Map(selectedPods.map((pod) => [pod.sId, pod.name])),
    [selectedPods]
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
        overriddenInPodNames: [],
      });
    }
    for (const envVar of podEnvVars) {
      const podName = envVar.spaceId
        ? podNamesById.get(envVar.spaceId)
        : undefined;
      if (!podName) {
        continue;
      }
      const row = rowsByName.get(envVar.name) ?? {
        name: envVar.name,
        kind: envVar.kind,
        hasWorkspaceVar: false,
        overriddenInPodNames: [],
      };
      rowsByName.set(row.name, {
        ...row,
        overriddenInPodNames: [...row.overriddenInPodNames, podName],
      });
    }
    return [...rowsByName.values()]
      .filter(
        // Hide workspace-only rows when the Workspace is not a viewed scope.
        (row) =>
          includeWorkspace ||
          !row.hasWorkspaceVar ||
          row.overriddenInPodNames.length > 0
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [envVars, podEnvVars, podNamesById, includeWorkspace]);

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
          const scopeNames = [
            ...(includeWorkspace && row.hasWorkspaceVar ? ["Workspace"] : []),
            ...row.overriddenInPodNames,
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
                <span
                  className={
                    row.kind === "https_secret"
                      ? "shrink-0 rounded-full bg-golden-100 px-2 py-0.5 text-xs font-medium text-golden-800"
                      : "shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700"
                  }
                >
                  {labelForKind(row.kind)}
                </span>
                {scopeNames.map((scopeName, index) => (
                  <span
                    key={`${scopeName}-${index}`}
                    className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                  >
                    {scopeName}
                  </span>
                ))}
              </div>
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
          onSaved={() => void mutatePodEnvVars()}
          existingEnvVars={[]}
          podTargeting={{
            pods: allPods,
            initialSelectedPodIds: selectedPods.map((pod) => pod.sId),
          }}
        />
      ) : null}

      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title="Environment variables"
          description="Which scopes define each variable. Values are write-only and never shown or compared."
        />

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
