import {
  Button,
  Chip,
  ContextItem,
  Input,
  Tooltip,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";
import { safeParseJSON } from "@app/types";

interface CustomField {
  id: number;
  name: string;
}

export function ZendeskCustomFieldFilters({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
  const { isDark } = useTheme();
  const sendNotification = useSendNotification();
  const [inputValue, setInputValue] = useState("");

  const {
    configValue: customFieldsConfigValue,
    mutateConfig: mutateCustomFieldsConfig,
    isResourcesLoading: loading,
  } = useConnectorConfig({
    configKey: ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG,
    dataSource,
    owner,
  });

  const customFields: CustomField[] = useMemo(() => {
    if (!customFieldsConfigValue) {
      return [];
    }
    const parsingResult = safeParseJSON(customFieldsConfigValue);
    if (parsingResult.isErr()) {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return (parsingResult.value || []) as CustomField[];
  }, [customFieldsConfigValue]);

  const addCustomFieldById = useCallback(
    async (fieldId: string) => {
      const trimmedFieldId = fieldId.trim();
      if (!trimmedFieldId) {
        sendNotification({
          type: "info",
          title: "Invalid field ID",
          description: "Field ID cannot be empty.",
        });
        return;
      }

      const numericFieldId = parseInt(trimmedFieldId, 10);
      if (isNaN(numericFieldId) || numericFieldId <= 0) {
        sendNotification({
          type: "info",
          title: "Invalid field ID",
          description: "Field ID must be a positive number.",
        });
        return;
      }

      if (customFields.some((field) => field.id === numericFieldId)) {
        sendNotification({
          type: "info",
          title: "Field already added",
          description: "This custom field is already configured.",
        });
        return;
      }

      // Get current field IDs and add the new one.
      const currentFieldIds = customFields.map((field) => field.id);
      const updatedFieldIds = [...currentFieldIds, numericFieldId];

      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG}`,
        {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({
            configValue: JSON.stringify(updatedFieldIds),
          }),
        }
      );

      if (res.ok) {
        await mutateCustomFieldsConfig();
        sendNotification({
          type: "success",
          title: "Custom field added",
          description: `Added custom field with ID ${numericFieldId}.`,
        });
      } else {
        const err = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to add custom field",
          description:
            err.error?.connectors_error?.message || "An unknown error occurred",
        });
      }
    },
    [
      owner.sId,
      dataSource.sId,
      customFields,
      mutateCustomFieldsConfig,
      sendNotification,
    ]
  );

  const removeCustomField = useCallback(
    async (fieldId: number) => {
      const fieldToRemove = customFields.find((field) => field.id === fieldId);
      if (!fieldToRemove) {
        sendNotification({
          type: "info",
          title: "Field not found",
          description: "The field is not configured.",
        });
        return;
      }

      const newFieldIds = customFields
        .filter((field) => field.id !== fieldId)
        .map((field) => field.id);

      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG}`,
        {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({ configValue: JSON.stringify(newFieldIds) }),
        }
      );

      if (res.ok) {
        await mutateCustomFieldsConfig();
        sendNotification({
          type: "success",
          title: "Custom field removed",
          description: `Removed custom field "${fieldToRemove.name}".`,
        });
      } else {
        const err = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to remove custom field",
          description:
            err.error?.connectors_error?.message || "An unknown error occurred",
        });
      }
    },
    [
      owner.sId,
      dataSource.sId,
      customFields,
      mutateCustomFieldsConfig,
      sendNotification,
    ]
  );

  const handleSave = async () => {
    if (!inputValue.trim()) {
      return;
    }

    await addCustomFieldById(inputValue.trim());
    setInputValue("");
  };

  const handleRemoveField = async (fieldId: number) => {
    await removeCustomField(fieldId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <ContextItem
      title="Custom Field Tags"
      visual={
        <ContextItem.Visual visual={isDark ? ZendeskWhiteLogo : ZendeskLogo} />
      }
    >
      <div className="space-y-4">
        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <p className="text-sm">
            Configure custom ticket field that should be included as tags when
            syncing tickets. Custom field values will be added as tags in the
            format "fieldName:value".
          </p>
        </div>

        {!readOnly && isAdmin && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                type="number"
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter custom field ID"
                disabled={loading}
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={loading || !inputValue.trim()}
                label="Add Field"
              />
            </div>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Enter the numeric ID of the custom field from Zendesk. You can
              find this in your Zendesk admin settings under Fields.
            </p>
          </div>
        )}

        <div>
          {customFields.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customFields.map((field: CustomField) => (
                <Tooltip
                  key={field.id}
                  label={`Field ID: ${field.id}`}
                  trigger={
                    <Chip
                      label={field.name}
                      color="highlight"
                      size="sm"
                      onRemove={
                        !readOnly && isAdmin
                          ? () => handleRemoveField(field.id)
                          : undefined
                      }
                    />
                  }
                />
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
              No tag filters configured.
            </p>
          )}
        </div>
      </div>
    </ContextItem>
  );
}
