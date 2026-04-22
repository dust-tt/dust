import { useSendNotification } from "@app/hooks/useNotification";
import type { MicrosoftAllowedLabel } from "@app/lib/models/workspace_sensitivity_label_config";
import { saveDataClassificationLabels } from "@app/lib/swr/data_classification_labels";
import type { MicrosoftSensitivityLabel } from "@app/pages/api/w/[wId]/data-classification-labels";
import { isAdmin, type LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";
import type { SensitivityLabelSource } from "./types";

interface MicrosoftLabelsSelectorProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  labels: MicrosoftSensitivityLabel[];
  savedAllowedLabels: MicrosoftAllowedLabel[];
  onSaved: () => void;
  readOnly: boolean;
  hasError: boolean;
}

export function MicrosoftLabelsSelector({
  owner,
  source,
  labels,
  savedAllowedLabels,
  onSaved,
  readOnly,
  hasError,
}: MicrosoftLabelsSelectorProps) {
  const sendNotification = useSendNotification();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(savedAllowedLabels)
  );
  const [isSaving, setIsSaving] = useState(false);

  const isAdminUser = isAdmin(owner);

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
        source,
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
              className="flex-1 justify-between"
              disabled={readOnly || !isAdminUser}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="start">
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
            disabled={readOnly || !isAdminUser || isSaving}
            onClick={() => void handleSave()}
          />
        )}
      </div>
    </div>
  );
}
