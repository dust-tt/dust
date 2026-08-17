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
  Chip,
  ContentMessage,
  InfoCircle,
  ListGroup,
  ListItem,
  Page,
  Plus,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MultiPodEnvVarsSectionProps {
  owner: LightWorkspaceType;
  selection: SandboxPodSelection;
  // The pods `selection` resolves to, for names and counts.
  selectedPods: PodType[];
  // All live pods, for the add dialog's Pod targeting.
  allPods: SandboxEnvVarPodOption[];
}

type VariableRow = {
  name: string;
  kind: SandboxEnvVarKind;
  hasWorkspaceVar: boolean;
  // Names of selected pods carrying a pod-scoped row with this name.
  overriddenInPodNames: string[];
};

// Values are write-only and never compared; this view only shows where each
// name is defined across the selected Pods.
export function MultiPodEnvVarsSection({
  owner,
  selection,
  selectedPods,
  allPods,
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
    return [...rowsByName.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [envVars, podEnvVars, podNamesById]);

  const totalPods = selectedPods.length;

  const stateChipForRow = (row: VariableRow) => {
    const podCount = row.overriddenInPodNames.length;
    const podNames = row.overriddenInPodNames.join(", ");

    if (row.hasWorkspaceVar) {
      if (podCount === 0) {
        return (
          <Tooltip
            label="Defined at the workspace level; all selected Pods inherit it."
            trigger={<Chip size="xs" color="success" label="Inherited" />}
          />
        );
      }
      if (podCount === totalPods) {
        return (
          <Tooltip
            label={`Overridden in ${podNames}`}
            trigger={
              <Chip size="xs" color="warning" label="Overridden in all Pods" />
            }
          />
        );
      }
      return (
        <Tooltip
          label={`Overridden in ${podNames}; the other Pods inherit the workspace value.`}
          trigger={
            <Chip
              size="xs"
              color="warning"
              label={`Mixed — overridden in ${podCount} of ${totalPods} Pods`}
            />
          }
        />
      );
    }

    if (podCount === totalPods) {
      return <Chip size="xs" color="primary" label="Pod-only — all Pods" />;
    }
    return (
      <Tooltip
        label={`Defined in ${podNames}; missing in the other selected Pods.`}
        trigger={
          <Chip
            size="xs"
            color="primary"
            label={`Pod-only — ${podCount} of ${totalPods} Pods`}
          />
        }
      />
    );
  };

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
      <ListGroup>
        {rows.map((row) => (
          <ListItem key={row.name} itemsAlignment="center">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <pre
                title={row.name}
                className="min-w-0 self-start overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
              >
                {row.name}
              </pre>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip
                  size="xs"
                  color={row.kind === "https_secret" ? "warning" : "info"}
                  label={labelForKind(row.kind)}
                />
                {stateChipForRow(row)}
              </div>
            </div>
          </ListItem>
        ))}
      </ListGroup>
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
          description={`Where each variable is defined across the ${totalPods} selected Pods. Values are write-only and never shown or compared. To replace or delete a value, select a single Pod or switch to the Workspace view.`}
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
