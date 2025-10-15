import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Input,
  Label,
  SearchInput,
  Tooltip,
} from "@dust-tt/sparkle";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import React, { useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import type { MCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { asDisplayName } from "@app/types";

function formatKeyForDisplay(key: string): string {
  const segments = key.split(".");
  return asDisplayName(segments[segments.length - 1]);
}

function getKeyPrefix(key: string): string {
  const segments = key.split(".");
  return segments.length > 1 ? segments[0] : "";
}

function groupKeysByPrefix(
  items:
    | MCPServerRequirements["requiredNumbers"]
    | MCPServerRequirements["requiredStrings"]
    | MCPServerRequirements["requiredBooleans"]
): Record<string, { key: string; description?: string }[]> {
  const groups: Record<string, { key: string; description?: string }[]> = {};

  items.forEach((item) => {
    const prefix = getKeyPrefix(item.key);
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(item);
  });

  return groups;
}

interface BaseConfigurationInputProps {
  configKey: string;
  description?: string;
}

function BooleanConfigurationInput({
  configKey,
  description,
}: BaseConfigurationInputProps) {
  const { field } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-4">
      <div className="flex w-1/5 items-center gap-2">
        <Label htmlFor={`boolean-${configKey}`} className="text-sm font-medium">
          {formatKeyForDisplay(configKey)}
        </Label>
        {description && (
          <Tooltip
            trigger={
              <Icon
                visual={InformationCircleIcon}
                size="xs"
                className="cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-400-night dark:hover:text-gray-600-night"
              />
            }
            label={description}
          />
        )}
      </div>
      <Checkbox
        id={`boolean-${configKey}`}
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked)}
      />
    </div>
  );
}

interface BooleanConfigurationSectionProps
  extends Pick<MCPServerRequirements, "requiredBooleans"> {}

function BooleanConfigurationSection({
  requiredBooleans,
}: BooleanConfigurationSectionProps) {
  if (requiredBooleans.length === 0) {
    return null;
  }

  return requiredBooleans.map(({ key, description }) => (
    <BooleanConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

interface NumberConfigurationInputProps {
  configKey: string;
  description?: string;
}

function NumberConfigurationInput({
  configKey,
  description,
}: NumberConfigurationInputProps) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-4">
      <div className="flex w-1/5 items-center gap-2">
        <Label htmlFor={`number-${configKey}`} className="text-sm font-medium">
          {formatKeyForDisplay(configKey)}
        </Label>
        {description && (
          <Tooltip
            trigger={
              <Icon
                visual={InformationCircleIcon}
                size="xs"
                className="cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-400-night dark:hover:text-gray-600-night"
              />
            }
            label={description}
          />
        )}
      </div>
      <div className="flex-1">
        <Input
          id={`number-${configKey}`}
          type="number"
          {...field}
          value={field.value || null}
          placeholder={`Enter value for ${formatKeyForDisplay(configKey)}`}
          isError={!!fieldState.error}
          message={fieldState.error?.message}
        />
      </div>
    </div>
  );
}

interface NumberConfigurationSectionProps
  extends Pick<MCPServerRequirements, "requiredNumbers"> {}

function NumberConfigurationSection({
  requiredNumbers,
}: NumberConfigurationSectionProps) {
  if (requiredNumbers.length === 0) {
    return null;
  }

  return requiredNumbers.map(({ key, description }) => (
    <NumberConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

interface StringConfigurationInputProps {
  configKey: string;
  description?: string;
}

function StringConfigurationInput({
  configKey,
  description,
}: StringConfigurationInputProps) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-4">
      <div className="flex w-1/5 items-center gap-2">
        <Label htmlFor={`string-${configKey}`} className="text-sm font-medium">
          {formatKeyForDisplay(configKey)}
        </Label>
        {description && (
          <Tooltip
            trigger={
              <Icon
                visual={InformationCircleIcon}
                size="xs"
                className="cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-400-night dark:hover:text-gray-600-night"
              />
            }
            label={description}
          />
        )}
      </div>
      <div className="flex-1">
        <Input
          id={`string-${configKey}`}
          type="text"
          {...field}
          value={field.value || null}
          placeholder={`Enter value for ${formatKeyForDisplay(configKey)}`}
          isError={!!fieldState.error}
          message={fieldState.error?.message}
        />
      </div>
    </div>
  );
}

interface StringConfigurationSectionProps
  extends Pick<MCPServerRequirements, "requiredStrings"> {}

function StringConfigurationSection({
  requiredStrings,
}: StringConfigurationSectionProps) {
  if (requiredStrings.length === 0) {
    return null;
  }

  return requiredStrings.map(({ key, description }) => (
    <StringConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

interface EnumConfigurationInputProps {
  configKey: string;
  enumOptions: MCPServerRequirements["requiredEnums"][string]["options"];
  description?: string;
}

function EnumConfigurationInput({
  configKey,
  enumOptions,
  description,
}: EnumConfigurationInputProps) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  const displayLabel = `Select ${formatKeyForDisplay(configKey)}`;
  const currentValue = field.value?.toString();
  const currentOption = currentValue
    ? enumOptions.find((option) => option.value === currentValue)
    : undefined;
  const currentLabel = currentOption ? currentOption.label : displayLabel;
  const currentDescription = currentOption?.description;

  return (
    <div className="flex flex-col gap-1">
      <div key={configKey} className="mb-2 flex items-center gap-4">
        <div className="flex w-1/5 items-center gap-2">
          <Label className="text-sm font-medium">
            {formatKeyForDisplay(configKey)}
          </Label>
          {description && (
            <Tooltip
              trigger={
                <Icon
                  visual={InformationCircleIcon}
                  size="xs"
                  className="cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-400-night dark:hover:text-gray-600-night"
                />
              }
              label={description}
            />
          )}
        </div>
        <div className="flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                isSelect
                label={currentLabel}
                size="sm"
                tooltip={displayLabel}
                variant="outline"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {enumOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  label={option.label}
                  onSelect={() => field.onChange(option.value)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {!!fieldState.error && (
            <div className={"error flex items-center gap-1 text-xs"}>
              {fieldState.error.message}
            </div>
          )}
        </div>
      </div>
      {currentDescription && (
        <div className="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-600-night">
          {currentDescription}
        </div>
      )}
    </div>
  );
}

interface EnumConfigurationSectionProps
  extends Pick<MCPServerRequirements, "requiredEnums"> {}

function EnumConfigurationSection({
  requiredEnums,
}: EnumConfigurationSectionProps) {
  if (Object.keys(requiredEnums).length === 0) {
    return null;
  }

  return Object.entries(requiredEnums).map(
    ([key, { options, description }]) => (
      <EnumConfigurationInput
        key={key}
        configKey={key}
        enumOptions={options}
        description={description}
      />
    )
  );
}

interface ListConfigurationInputProps {
  configKey: string;
  listOptions: MCPServerRequirements["requiredLists"][string]["options"];
  description?: string;
}

function ListConfigurationInput({
  configKey,
  listOptions,
  description,
}: ListConfigurationInputProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  const currentValue: string[] = useMemo(() => {
    return Array.isArray(field.value) ? field.value : [];
  }, [field.value]);

  const filteredOptions = useMemo(() => {
    if (searchQuery.trim() === "") {
      return listOptions;
    }
    return listOptions.filter((option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [listOptions, searchQuery]);

  return (
    <div className="mb-4 flex flex-col gap-2">
      <Label className="text-sm font-medium">
        {formatKeyForDisplay(configKey)}
      </Label>
      {description && (
        <Label className="text-xs text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </Label>
      )}
      <div className="space-y-2">
        <SearchInput
          name={`search-${configKey}`}
          placeholder={`Search ${formatKeyForDisplay(configKey).toLowerCase()}...`}
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <div className="space-y-1">
          {filteredOptions.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery.trim() === ""
                ? "No options available"
                : `No options match "${searchQuery}"`}
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                className="group flex items-center justify-between rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={currentValue.includes(option.value)}
                    size="xs"
                    onCheckedChange={(checked) => {
                      const current = Array.isArray(field.value)
                        ? field.value
                        : [];
                      const newValues = checked
                        ? [...current, option.value]
                        : current.filter((v) => v !== option.value);
                      field.onChange(newValues);
                    }}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {option.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {!!fieldState.error && (
          <div className="error flex items-center gap-1 text-xs">
            {fieldState.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

interface ListConfigurationSectionProps
  extends Pick<MCPServerRequirements, "requiredLists"> {}

function ListConfigurationSection({
  requiredLists,
}: ListConfigurationSectionProps) {
  if (Object.keys(requiredLists).length === 0) {
    return null;
  }

  return Object.entries(requiredLists).map(
    ([key, { options, description }]) => (
      <ListConfigurationInput
        key={key}
        configKey={key}
        listOptions={options}
        description={description}
      />
    )
  );
}

interface GroupedConfigurationSectionProps
  extends Pick<
    MCPServerRequirements,
    | "requiredStrings"
    | "requiredNumbers"
    | "requiredBooleans"
    | "requiredEnums"
    | "requiredLists"
  > {
  prefix: string;
}

function GroupedConfigurationSection({
  prefix,
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
  requiredEnums,
  requiredLists,
}: GroupedConfigurationSectionProps) {
  const hasConfiguration =
    requiredStrings.length > 0 ||
    requiredNumbers.length > 0 ||
    requiredBooleans.length > 0 ||
    Object.keys(requiredEnums).length > 0 ||
    Object.keys(requiredLists).length > 0;

  if (!hasConfiguration) {
    return null;
  }

  return (
    <div className="mb-6 w-full">
      {prefix && (
        <Label className="mb-4 block text-lg font-medium text-foreground dark:text-foreground-night">
          {asDisplayName(prefix)}
        </Label>
      )}
      <div className="w-full space-y-4">
        <StringConfigurationSection requiredStrings={requiredStrings} />
        <NumberConfigurationSection requiredNumbers={requiredNumbers} />
        <BooleanConfigurationSection requiredBooleans={requiredBooleans} />
        <EnumConfigurationSection requiredEnums={requiredEnums} />
        <ListConfigurationSection requiredLists={requiredLists} />
      </div>
    </div>
  );
}

interface AdditionalConfigurationSectionProps
  extends Pick<
    MCPServerRequirements,
    | "requiredStrings"
    | "requiredNumbers"
    | "requiredBooleans"
    | "requiredEnums"
    | "requiredLists"
  > {}

export function AdditionalConfigurationSection({
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
  requiredEnums,
  requiredLists,
}: AdditionalConfigurationSectionProps) {
  const { owner } = useAgentBuilderContext();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const hasWebSummarizationFlag = featureFlags.includes("web_summarization");

  const filteredBooleanConfigurations = useMemo(
    () =>
      requiredBooleans.filter(
        ({ key }) => !(key === "useSummary" && !hasWebSummarizationFlag)
      ),
    [requiredBooleans, hasWebSummarizationFlag]
  );

  // Group configuration fields by prefix.
  const groupedStrings = useMemo(
    () => groupKeysByPrefix(requiredStrings),
    [requiredStrings]
  );
  const groupedNumbers = useMemo(
    () => groupKeysByPrefix(requiredNumbers),
    [requiredNumbers]
  );
  const groupedBooleans = useMemo(
    () => groupKeysByPrefix(filteredBooleanConfigurations),
    [filteredBooleanConfigurations]
  );
  const groupedEnums = useMemo(() => {
    const groups: Record<
      string,
      Record<
        string,
        {
          options: {
            value: string;
            label: string;
            description?: string;
          }[];
          description?: string;
        }
      >
    > = {};
    Object.entries(requiredEnums).forEach(([key, values]) => {
      const prefix = getKeyPrefix(key);
      if (!groups[prefix]) {
        groups[prefix] = {};
      }
      groups[prefix][key] = values;
    });
    return groups;
  }, [requiredEnums]);

  const groupedLists = useMemo(() => {
    const groups: Record<
      string,
      Record<
        string,
        {
          options: {
            value: string;
            label: string;
            description?: string;
          }[];
          description?: string;
        }
      >
    > = {};
    Object.entries(requiredLists).forEach(([key, values]) => {
      const prefix = getKeyPrefix(key);
      if (!groups[prefix]) {
        groups[prefix] = {};
      }
      groups[prefix][key] = values;
    });
    return groups;
  }, [requiredLists]);

  // Get all unique prefixes
  const allPrefixes = useMemo(() => {
    const prefixSet = new Set<string>();

    Object.keys(groupedStrings).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedNumbers).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedBooleans).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedEnums).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedLists).forEach((prefix) => prefixSet.add(prefix));

    return Array.from(prefixSet).sort();
  }, [
    groupedStrings,
    groupedNumbers,
    groupedBooleans,
    groupedEnums,
    groupedLists,
  ]);

  const hasConfiguration =
    requiredStrings.length > 0 ||
    requiredNumbers.length > 0 ||
    filteredBooleanConfigurations.length > 0 ||
    Object.keys(requiredEnums).length > 0 ||
    Object.keys(requiredLists).length > 0;

  if (!hasConfiguration) {
    return null;
  }

  return (
    <ConfigurationSectionContainer
      title="Additional configuration"
      description="Configure additional parameters required by this action."
    >
      {allPrefixes.map((prefix) => (
        <GroupedConfigurationSection
          key={prefix || "general"}
          prefix={prefix}
          requiredStrings={groupedStrings[prefix] || []}
          requiredNumbers={groupedNumbers[prefix] || []}
          requiredBooleans={groupedBooleans[prefix] || []}
          requiredEnums={groupedEnums[prefix] || {}}
          requiredLists={groupedLists[prefix] || {}}
        />
      ))}
    </ConfigurationSectionContainer>
  );
}
