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
import { useEffect, useState } from "react";
import type { SensitivityLabelSource } from "./types";

interface MicrosoftLabelsSelectorProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  labels: MicrosoftSensitivityLabel[];
  savedAllowedLabels: MicrosoftAllowedLabel[];
  onSaved: () => Promise<unknown> | unknown;
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

  useEffect(() => {
    if (!isSaving) {
      setSelected(new Set(savedAllowedLabels));
    }
  }, [savedAllowedLabels, isSaving]);

  const toggleAndSave = async (id: string) => {
    const previousSelection = selected;
    const nextSelection = new Set(selected);
    if (nextSelection.has(id)) {
      nextSelection.delete(id);
    } else {
      nextSelection.add(id);
    }
    const allowedLabels = Array.from(nextSelection);

    setSelected(nextSelection);
    setIsSaving(true);
    try {
      const result = await saveDataClassificationLabels({
        owner,
        source,
        allowedLabels,
      });
      if (result.success) {
        await onSaved();
        sendNotification({
          type: "success",
          title: "Labels setting updated successfully",
          description: "Sensitivity label filtering has been updated.",
        });
      } else {
        setSelected(previousSelection);
        sendNotification({
          type: "error",
          title: "Failed to update labels setting",
          description: result.error,
        });
      }
    } catch (error) {
      setSelected(previousSelection);
      sendNotification({
        type: "error",
        title: "Failed to update sensitivity labels setting",
        description:
          error instanceof Error ? error.message : "An unknown error occurred.",
      });
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
              disabled={readOnly || !isAdminUser || isSaving}
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
                      onCheckedChange={() => void toggleAndSave(label.id)}
                      onSelect={(e) => e.preventDefault()}
                    />
                  ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
