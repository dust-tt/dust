import {
  Button,
  Chip,
  ContextItem,
  Input,
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
    return (parsingResult.value || []) as CustomField[];
  }, [customFieldsConfigValue]);

  const addCustomFieldByName = useCallback(
    async (fieldName: string) => {
      const trimmedFieldName = fieldName.trim();
      if (!trimmedFieldName) {
        sendNotification({
          type: "info",
          title: "Invalid field name",
          description: "Field name cannot be empty.",
        });
        return;
      }

      // Get current field names and add the new one.
      const currentFieldNames = customFields.map((field) => field.name);
      const updatedFieldNames = [...currentFieldNames, trimmedFieldName];

      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG}`,
        {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({
            configValue: JSON.stringify(updatedFieldNames),
          }),
        }
      );

      if (res.ok) {
        await mutateCustomFieldsConfig();
        sendNotification({
          type: "success",
          title: "Custom field added",
          description: `Added custom field "${trimmedFieldName}".`,
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

      const newFields = customFields
        .filter((field) => field.id !== fieldId)
        .map((field) => field.name);

      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG}`,
        {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({ configValue: JSON.stringify(newFields) }),
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

    await addCustomFieldByName(inputValue.trim());
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
            Configure custom ticket field names that should be included as tags
            when syncing tickets. Custom field values will be added as tags in
            the format "fieldName:value".
          </p>
        </div>

        {!readOnly && isAdmin && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter custom field name"
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
              Enter the exact name of the custom field as it appears in Zendesk.
              The field will be validated when added.
            </p>
          </div>
        )}

        <div>
          {customFields.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customFields.map((field: CustomField) => (
                <Chip
                  key={field.id}
                  label={field.name}
                  color="blue"
                  size="sm"
                  onRemove={
                    !readOnly && isAdmin
                      ? () => handleRemoveField(field.id)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-gray-50 p-4 dark:bg-gray-800">
              <p className="text-center text-sm text-muted-foreground">
                No custom fields configured yet. Add your first custom field
                below.
              </p>
            </div>
          )}
        </div>
      </div>
    </ContextItem>
  );
}
