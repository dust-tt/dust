import { useSendNotification } from "@app/hooks/useNotification";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import {
  saveDataClassificationLabels,
  useDataClassificationLabels,
} from "@app/lib/swr/data_classification_labels";
import type { MicrosoftSensitivityLabel } from "@app/pages/api/w/[wId]/data-classification-labels";
import type { DataSourceType } from "@app/types/data_source";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

// ─── Connector variant ────────────────────────────────────────────────────────

interface ConnectorSensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  readOnly: boolean;
  isAdmin: boolean;
}

export function ConnectorSensitivityLabelsConfig({
  owner,
  dataSource,
  readOnly,
  isAdmin,
}: ConnectorSensitivityLabelsConfigProps) {
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    isDataClassificationLabelsError,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, dataSourceId: dataSource.sId });

  if (isDataClassificationLabelsLoading) {
    return null;
  }

  return (
    <MicrosoftLabelsSelector
      owner={owner}
      source={{ dataSourceId: dataSource.sId }}
      labels={dataClassificationLabels?.labels ?? []}
      savedAllowedLabels={
        (dataClassificationLabels?.allowedLabels ??
          []) as MicrosoftAllowedLabel[]
      }
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      isAdmin={isAdmin}
      hasError={!!isDataClassificationLabelsError}
    />
  );
}

// ─── MCP tool variant ─────────────────────────────────────────────────────────

interface MCPSensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  internalMCPServerId: string;
  readOnly?: boolean;
  isAdmin: boolean;
}

export function MCPSensitivityLabelsConfig({
  owner,
  internalMCPServerId,
  readOnly = false,
  isAdmin,
}: MCPSensitivityLabelsConfigProps) {
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    isDataClassificationLabelsError,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, internalMCPServerId });

  if (isDataClassificationLabelsLoading) {
    return null;
  }

  return (
    <MicrosoftLabelsSelector
      owner={owner}
      source={{ internalMCPServerId }}
      labels={dataClassificationLabels?.labels ?? []}
      savedAllowedLabels={dataClassificationLabels?.allowedLabels ?? []}
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      isAdmin={isAdmin}
      hasError={!!isDataClassificationLabelsError}
    />
  );
}

// ─── Microsoft selector ───────────────────────────────────────────────────────

type Source =
  | { dataSourceId: string; internalMCPServerId?: never }
  | { internalMCPServerId: string; dataSourceId?: never };

interface MicrosoftLabelsSelectorProps {
  owner: LightWorkspaceType;
  source: Source;
  labels: MicrosoftSensitivityLabel[];
  savedAllowedLabels: MicrosoftAllowedLabel[];
  onSaved: () => void;
  readOnly: boolean;
  isAdmin: boolean;
  hasError: boolean;
}

function MicrosoftLabelsSelector({
  owner,
  source,
  labels,
  savedAllowedLabels,
  onSaved,
  readOnly,
  isAdmin,
  hasError,
}: MicrosoftLabelsSelectorProps) {
  const sendNotification = useSendNotification();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(savedAllowedLabels)
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveDataClassificationLabels({
        owner,
        ...source,
        allowedLabels: Array.from(selected),
      });
      if (result.success) {
        sendNotification({
          type: "success",
          title: "Microsoft Purview labels saved.",
          description: "Label filtering configuration updated.",
        });
        onSaved();
      } else {
        sendNotification({
          type: "error",
          title: "Failed to save Microsoft Purview labels.",
          description: result.error,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const triggerLabel =
    selected.size === 0
      ? "Select labels"
      : `${selected.size} label${selected.size === 1 ? "" : "s"} selected`;

  const emptyContent = hasError ? (
    <p className="px-2 py-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
      Labels could not be retrieved. Make sure to grant the necessary
      permissions to your Dust app in Azure.
    </p>
  ) : (
    <p className="px-2 py-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
      No labels found. Configure them in your Microsoft Purview console first.
    </p>
  );

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              label={triggerLabel}
              variant="outline"
              size="sm"
              isSelect
              className="w-52 justify-between"
              disabled={readOnly || !isAdmin}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <div className="max-h-80 overflow-auto">
              {labels.length === 0
                ? emptyContent
                : labels.map((label) => (
                    <DropdownMenuCheckboxItem
                      key={label.id}
                      label={label.name}
                      checked={selected.has(label.id)}
                      onCheckedChange={() => toggle(label.id)}
                      onSelect={(e) => e.preventDefault()}
                    />
                  ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {labels.length > 0 && (
          <Button
            label="Save"
            size="sm"
            variant="primary"
            disabled={readOnly || !isAdmin || isSaving}
            onClick={() => void handleSave()}
          />
        )}
      </div>
    </div>
  );
}
