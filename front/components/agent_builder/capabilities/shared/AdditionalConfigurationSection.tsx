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

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { asDisplayName } from "@app/types";

type OptionalDescribedKey = { key: string; description?: string };

function formatKeyForDisplay(key: string): string {
  const segments = key.split(".");
  return asDisplayName(segments[segments.length - 1]);
}

function getKeyPrefix(key: string): string {
  const segments = key.split(".");
  return segments.length > 1 ? segments[0] : "";
}

function groupKeysByPrefix(
  items: OptionalDescribedKey[]
): Record<string, OptionalDescribedKey[]> {
  const groups: Record<string, OptionalDescribedKey[]> = {};

  items.forEach((item) => {
    const prefix = getKeyPrefix(item.key);
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(item);
  });

  return groups;
}

function BooleanConfigurationInput({
  configKey,
  description,
}: {
  configKey: string;
  description?: string;
}) {
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
                className="cursor-help text-gray-400 hover:text-gray-600"
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

function BooleanConfigurationSection({
  booleanConfigurations,
}: {
  booleanConfigurations: OptionalDescribedKey[];
}) {
  if (booleanConfigurations.length === 0) {
    return null;
  }

  return booleanConfigurations.map(({ key, description }) => (
    <BooleanConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

function NumberConfigurationInput({
  configKey,
  description,
}: {
  configKey: string;
  description?: string;
}) {
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
                className="cursor-help text-gray-400 hover:text-gray-600"
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

function NumberConfigurationSection({
  numberConfigurations,
}: {
  numberConfigurations: OptionalDescribedKey[];
}) {
  if (numberConfigurations.length === 0) {
    return null;
  }

  return numberConfigurations.map(({ key, description }) => (
    <NumberConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

function StringConfigurationInput({
  configKey,
  description,
}: {
  configKey: string;
  description?: string;
}) {
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
                className="cursor-help text-gray-400 hover:text-gray-600"
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

function StringConfigurationSection({
  stringConfigurations,
}: {
  stringConfigurations: OptionalDescribedKey[];
}) {
  if (stringConfigurations.length === 0) {
    return null;
  }

  return stringConfigurations.map(({ key, description }) => (
    <StringConfigurationInput
      key={key}
      configKey={key}
      description={description}
    />
  ));
}

function EnumConfigurationInput({
  configKey,
  enumOptions,
  description,
}: {
  configKey: string;
  enumOptions: Array<{ value: string; label: string; description?: string }>;
  description?: string;
}) {
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
                  className="cursor-help text-gray-400 hover:text-gray-600"
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
        <div className="mt-1 text-sm text-gray-600">{currentDescription}</div>
      )}
    </div>
  );
}

function EnumConfigurationSection({
  enumConfigurations,
}: {
  enumConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
}) {
  if (Object.keys(enumConfigurations).length === 0) {
    return null;
  }

  return Object.entries(enumConfigurations).map(
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

function ListConfigurationInput({
  configKey,
  listOptions,
  description,
}: {
  configKey: string;
  listOptions: Array<{ value: string; label: string; description?: string }>;
  description?: string;
}) {
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

function ListConfigurationSection({
  listConfigurations,
}: {
  listConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
}) {
  if (Object.keys(listConfigurations).length === 0) {
    return null;
  }

  return Object.entries(listConfigurations).map(
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

interface GroupedConfigurationSectionProps {
  prefix: string;
  stringConfigurations: OptionalDescribedKey[];
  numberConfigurations: OptionalDescribedKey[];
  booleanConfigurations: OptionalDescribedKey[];
  enumConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
  listConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
}

function GroupedConfigurationSection({
  prefix,
  stringConfigurations,
  numberConfigurations,
  booleanConfigurations,
  enumConfigurations,
  listConfigurations,
}: GroupedConfigurationSectionProps) {
  const hasConfiguration =
    stringConfigurations.length > 0 ||
    numberConfigurations.length > 0 ||
    booleanConfigurations.length > 0 ||
    Object.keys(enumConfigurations).length > 0 ||
    Object.keys(listConfigurations).length > 0;

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
        <StringConfigurationSection
          stringConfigurations={stringConfigurations}
        />
        <NumberConfigurationSection
          numberConfigurations={numberConfigurations}
        />
        <BooleanConfigurationSection
          booleanConfigurations={booleanConfigurations}
        />
        <EnumConfigurationSection enumConfigurations={enumConfigurations} />
        <ListConfigurationSection listConfigurations={listConfigurations} />
      </div>
    </div>
  );
}

interface AdditionalConfigurationSectionProps {
  stringConfigurations: OptionalDescribedKey[];
  numberConfigurations: OptionalDescribedKey[];
  booleanConfigurations: OptionalDescribedKey[];
  enumConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
  listConfigurations: Record<
    string,
    {
      options: Array<{ value: string; label: string; description?: string }>;
      description?: string;
    }
  >;
}

export function AdditionalConfigurationSection({
  stringConfigurations,
  numberConfigurations,
  booleanConfigurations,
  enumConfigurations,
  listConfigurations,
}: AdditionalConfigurationSectionProps) {
  // Group configuration fields by prefix.
  const groupedStrings = useMemo(
    () => groupKeysByPrefix(stringConfigurations),
    [stringConfigurations]
  );
  const groupedNumbers = useMemo(
    () => groupKeysByPrefix(numberConfigurations),
    [numberConfigurations]
  );
  const groupedBooleans = useMemo(
    () => groupKeysByPrefix(booleanConfigurations),
    [booleanConfigurations]
  );
  const groupedEnums = useMemo(() => {
    const groups: Record<
      string,
      Record<
        string,
        {
          options: Array<{
            value: string;
            label: string;
            description?: string;
          }>;
          description?: string;
        }
      >
    > = {};
    Object.entries(enumConfigurations).forEach(([key, values]) => {
      const prefix = getKeyPrefix(key);
      if (!groups[prefix]) {
        groups[prefix] = {};
      }
      groups[prefix][key] = values;
    });
    return groups;
  }, [enumConfigurations]);

  const groupedLists = useMemo(() => {
    const groups: Record<
      string,
      Record<
        string,
        {
          options: Array<{
            value: string;
            label: string;
            description?: string;
          }>;
          description?: string;
        }
      >
    > = {};
    Object.entries(listConfigurations).forEach(([key, values]) => {
      const prefix = getKeyPrefix(key);
      if (!groups[prefix]) {
        groups[prefix] = {};
      }
      groups[prefix][key] = values;
    });
    return groups;
  }, [listConfigurations]);

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
    stringConfigurations.length > 0 ||
    numberConfigurations.length > 0 ||
    booleanConfigurations.length > 0 ||
    Object.keys(enumConfigurations).length > 0 ||
    Object.keys(listConfigurations).length > 0;

  if (!hasConfiguration) {
    return null;
  }

  return (
    <>
      <ConfigurationSectionContainer
        title="Additional configuration"
        description="Configure additional parameters required by this action."
      >
        {allPrefixes.map((prefix) => (
          <GroupedConfigurationSection
            key={prefix || "general"}
            prefix={prefix}
            stringConfigurations={groupedStrings[prefix] || []}
            numberConfigurations={groupedNumbers[prefix] || []}
            booleanConfigurations={groupedBooleans[prefix] || []}
            enumConfigurations={groupedEnums[prefix] || {}}
            listConfigurations={groupedLists[prefix] || {}}
          />
        ))}
      </ConfigurationSectionContainer>
    </>
  );
}
