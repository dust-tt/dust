import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  ContextItem,
  Input,
  Tooltip,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";

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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          title: t`Invalid field ID`,
          description: t`Field ID cannot be empty.`,
        });
        return;
      }

      const numericFieldId = parseInt(trimmedFieldId, 10);
      if (isNaN(numericFieldId) || numericFieldId <= 0) {
        sendNotification({
          type: "info",
          title: t`Invalid field ID`,
          description: t`Field ID must be a positive number.`,
        });
        return;
      }

      if (customFields.some((field) => field.id === numericFieldId)) {
        sendNotification({
          type: "info",
          title: t`Field already added`,
          description: t`This custom field is already configured.`,
        });
        return;
      }

      // Get current field IDs and add the new one.
      const currentFieldIds = customFields.map((field) => field.id);
      const updatedFieldIds = [...currentFieldIds, numericFieldId];

      const res = await clientFetch(
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
          title: t`Custom field added`,
          description: t`Added custom field with ID ${numericFieldId}.`,
        });
      } else {
        const err = await res.json();
        sendApiErrorNotification({
          title: t`Failed to add custom field`,
          error: err,
        });
      }
    },
    [
      owner.sId,
      dataSource.sId,
      customFields,
      mutateCustomFieldsConfig,
      sendNotification,
      t,
      sendApiErrorNotification,
    ]
  );

  const removeCustomField = useCallback(
    async (fieldId: number) => {
      const fieldToRemove = customFields.find((field) => field.id === fieldId);
      if (!fieldToRemove) {
        sendNotification({
          type: "info",
          title: t`Field not found`,
          description: t`The field is not configured.`,
        });
        return;
      }

      const newFieldIds = customFields
        .filter((field) => field.id !== fieldId)
        .map((field) => field.id);

      const res = await clientFetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG}`,
        {
          headers: { "Content-Type": "application/json" },
          method: "POST",
          body: JSON.stringify({ configValue: JSON.stringify(newFieldIds) }),
        }
      );

      if (res.ok) {
        await mutateCustomFieldsConfig();
        const fieldName = fieldToRemove.name;
        sendNotification({
          type: "success",
          title: t`Custom field removed`,
          description: t`Removed custom field "${fieldName}".`,
        });
      } else {
        const err = await res.json();
        sendApiErrorNotification({
          title: t`Failed to remove custom field`,
          error: err,
        });
      }
    },
    [
      owner.sId,
      dataSource.sId,
      customFields,
      mutateCustomFieldsConfig,
      sendNotification,
      t,
      sendApiErrorNotification,
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
      title={t`Custom field tags`}
      visual={<ContextItem.Visual visual={ZendeskLogo} />}
    >
      <div className="space-y-4">
        <div className="text-muted-foreground">
          <p className="text-sm">
            <Trans>
              Configure custom ticket field that should be included as tags when
              syncing tickets. Custom field values will be added as tags in the
              format "fieldName:value".
            </Trans>
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
                placeholder={t`Enter custom field ID`}
                disabled={loading}
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={loading || !inputValue.trim()}
                label={t`Add field`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>
                Enter the numeric ID of the custom field from Zendesk. You can
                find this in your Zendesk admin settings under Fields.
              </Trans>
            </p>
          </div>
        )}

        <div>
          {customFields.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customFields.map((field: CustomField) => {
                const fieldId = field.id;
                return (
                  <Tooltip
                    key={fieldId}
                    label={t`Field ID: ${fieldId}`}
                    trigger={
                      <Chip
                        label={field.name}
                        color="highlight"
                        size="sm"
                        onRemove={
                          !readOnly && isAdmin
                            ? () => handleRemoveField(fieldId)
                            : undefined
                        }
                      />
                    }
                  />
                );
              })}
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">
              <Trans>No tag filters configured.</Trans>
            </p>
          )}
        </div>
      </div>
    </ContextItem>
  );
}
