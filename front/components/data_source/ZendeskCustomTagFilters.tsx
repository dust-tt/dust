import {
  Button,
  ContextItem,
  Input,
  XMarkIcon,
  ZendeskLogo,
  ZendeskWhiteLogo,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

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
  const [isEditing, setIsEditing] = useState(false);

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
    return parsingResult.value;
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
    setIsEditing(false);
  };

  const handleRemoveField = async (fieldId: number) => {
    await removeCustomField(fieldId);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setInputValue("");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  const renderCustomFields = () => (
    <div className="flex flex-wrap gap-2">
      {customFields.map((field: CustomField) => (
        <span
          key={field.id}
          className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
        >
          {field.name}
          {!readOnly && isAdmin && (
            <button
              onClick={() => handleRemoveField(field.id)}
              disabled={loading}
              className="ml-1 hover:opacity-70 disabled:opacity-50"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );

  return (
    <ContextItem
      title="Custom Field Tags"
      visual={
        <ContextItem.Visual visual={isDark ? ZendeskWhiteLogo : ZendeskLogo} />
      }
      action={
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter custom field name"
                disabled={readOnly || !isAdmin || loading}
                className="w-80"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={readOnly || !isAdmin || loading || !inputValue.trim()}
                label="Add"
              />
              <Button
                size="sm"
                variant="ghost-secondary"
                onClick={handleCancel}
                disabled={readOnly || !isAdmin || loading}
                label="Cancel"
              />
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleEdit}
              disabled={readOnly || !isAdmin || loading}
              label="Add Custom Field"
            />
          )}
        </div>
      }
    >
      <ContextItem.Description>
        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <p className="mb-4">
            Configure custom ticket field names that should be included as tags
            when syncing tickets. Custom field values will be added as tags in
            the format "fieldName:value", making them searchable and filterable
            in Dust.
          </p>

          {customFields.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium">
                Configured Custom Fields:
              </p>
              {renderCustomFields()}
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">
              No custom fields configured. Custom field values will not be added
              as tags.
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            Enter the exact name of the custom field as it appears in Zendesk.
            The field will be validated against available fields when added.
            Field values will be formatted as "fieldName:value" tags during
            sync.
          </p>
        </div>
      </ContextItem.Description>
    </ContextItem>
  );
}
