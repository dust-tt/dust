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
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, dataSourceId: dataSource.sId });

  if (isDataClassificationLabelsLoading || !dataClassificationLabels) {
    return null;
  }

  return (
    <MicrosoftLabelsSelector
      owner={owner}
      source={{ dataSourceId: dataSource.sId }}
      labels={dataClassificationLabels.labels}
      savedAllowedLabels={
        dataClassificationLabels.allowedLabels as MicrosoftAllowedLabel[]
      }
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      isAdmin={isAdmin}
    />
  );
}

// ─── MCP tool variant ─────────────────────────────────────────────────────────

interface MCPSensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  internalMCPServerName: string;
  readOnly?: boolean;
  isAdmin: boolean;
}

export function MCPSensitivityLabelsConfig({
  owner,
  internalMCPServerName,
  readOnly = false,
  isAdmin,
}: MCPSensitivityLabelsConfigProps) {
  const {
    dataClassificationLabels,
    isDataClassificationLabelsLoading,
    mutateDataClassificationLabels,
  } = useDataClassificationLabels({ owner, internalMCPServerName });

  if (isDataClassificationLabelsLoading || !dataClassificationLabels) {
    return null;
  }

  return (
    <MicrosoftLabelsSelector
      owner={owner}
      source={{ internalMCPServerName }}
      labels={dataClassificationLabels.labels}
      savedAllowedLabels={dataClassificationLabels.allowedLabels}
      onSaved={mutateDataClassificationLabels}
      readOnly={readOnly}
      isAdmin={isAdmin}
    />
  );
}

// ─── Microsoft selector ───────────────────────────────────────────────────────

type Source =
  | { dataSourceId: string; internalMCPServerName?: never }
  | { internalMCPServerName: string; dataSourceId?: never };

interface MicrosoftLabelsSelectorProps {
  owner: LightWorkspaceType;
  source: Source;
  labels: MicrosoftSensitivityLabel[];
  savedAllowedLabels: MicrosoftAllowedLabel[];
  onSaved: () => void;
  readOnly: boolean;
  isAdmin: boolean;
}

function MicrosoftLabelsSelector({
  owner,
  source,
  labels,
  savedAllowedLabels,
  onSaved,
  readOnly,
  isAdmin,
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

  if (labels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No Microsoft Purview labels found. Configure them in your Microsoft
        Purview console first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Only files with the selected sensitivity labels will be synced into
        Dust. Unlabeled files are always allowed.
      </p>
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
              {labels.map((label) => (
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
        <Button
          label="Save"
          size="sm"
          variant="primary"
          disabled={readOnly || !isAdmin || isSaving}
          onClick={() => void handleSave()}
        />
      </div>
    </div>
  );
}
