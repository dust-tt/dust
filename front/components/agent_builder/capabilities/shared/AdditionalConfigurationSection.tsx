import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  SearchInput,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { asDisplayName } from "@app/types";

function formatKeyForDisplay(key: string): string {
  const segments = key.split(".");
  return asDisplayName(segments[segments.length - 1]);
}

function getKeyPrefix(key: string): string {
  const segments = key.split(".");
  return segments.length > 1 ? segments[0] : "";
}

function groupKeysByPrefix(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  keys.forEach((key) => {
    const prefix = getKeyPrefix(key);
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(key);
  });

  return groups;
}

function BooleanConfigurationInput({ configKey }: { configKey: string }) {
  const { field } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-1">
      <Label
        htmlFor={`boolean-${configKey}`}
        className="w-1/5 text-sm font-medium"
      >
        {formatKeyForDisplay(configKey)}
      </Label>
      <Checkbox
        id={`boolean-${configKey}`}
        checked={field.value === true}
        onCheckedChange={(checked) => field.onChange(checked)}
      />
    </div>
  );
}

function BooleanConfigurationSection({
  requiredBooleans,
}: {
  requiredBooleans: string[];
}) {
  if (requiredBooleans.length === 0) {
    return null;
  }

  return requiredBooleans.map((key) => (
    <BooleanConfigurationInput key={key} configKey={key} />
  ));
}

function NumberConfigurationInput({ configKey }: { configKey: string }) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-1">
      <Label
        htmlFor={`number-${configKey}`}
        className="w-1/5 text-sm font-medium"
      >
        {formatKeyForDisplay(configKey)}
      </Label>
      <Input
        id={`number-${configKey}`}
        type="number"
        {...field}
        placeholder={`Enter value for ${formatKeyForDisplay(configKey)}`}
        isError={!!fieldState.error}
        message={fieldState.error?.message}
      />
    </div>
  );
}

function NumberConfigurationSection({
  requiredNumbers,
}: {
  requiredNumbers: string[];
}) {
  if (requiredNumbers.length === 0) {
    return null;
  }

  return requiredNumbers.map((key) => (
    <NumberConfigurationInput key={key} configKey={key} />
  ));
}

function StringConfigurationInput({ configKey }: { configKey: string }) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  return (
    <div key={configKey} className="mb-2 flex items-center gap-1">
      <Label
        htmlFor={`string-${configKey}`}
        className="w-1/5 text-sm font-medium"
      >
        {formatKeyForDisplay(configKey)}
      </Label>
      <Input
        id={`string-${configKey}`}
        type="text"
        {...field}
        placeholder={`Enter value for ${formatKeyForDisplay(configKey)}`}
        isError={!!fieldState.error}
        message={fieldState.error?.message}
      />
    </div>
  );
}

function StringConfigurationSection({
  requiredStrings,
}: {
  requiredStrings: string[];
}) {
  if (requiredStrings.length === 0) {
    return null;
  }

  return requiredStrings.map((key) => (
    <StringConfigurationInput key={key} configKey={key} />
  ));
}

function EnumConfigurationInput({
  configKey,
  enumValues,
}: {
  configKey: string;
  enumValues: string[];
}) {
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  const displayLabel = `Select ${formatKeyForDisplay(configKey)}`;
  return (
    <>
      <div key={configKey} className="mb-2 flex items-center gap-1">
        <Label className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(configKey)}
        </Label>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                isSelect
                label={field.value?.toString() ?? displayLabel}
                size="sm"
                tooltip={displayLabel}
                variant="outline"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {enumValues.map((enumValue) => (
                <DropdownMenuItem
                  key={enumValue}
                  label={enumValue}
                  onSelect={() => field.onChange(enumValue)}
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
    </>
  );
}

function EnumConfigurationSection({
  requiredEnums,
}: {
  requiredEnums: Record<string, string[]>;
}) {
  if (Object.keys(requiredEnums).length === 0) {
    return null;
  }

  return Object.entries(requiredEnums).map(([key, enumValues]) => (
    <EnumConfigurationInput key={key} configKey={key} enumValues={enumValues} />
  ));
}

function ListConfigurationInput({
  configKey,
  listValues,
}: {
  configKey: string;
  listValues: Record<string, string>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { field, fieldState } = useController<MCPFormData>({
    name: `configuration.additionalConfiguration.${configKey}`,
  });

  const rawValue = field.value;
  const currentValue: string[] = Array.isArray(rawValue) ? rawValue : [];

  const filteredValues = useMemo(() => {
    if (searchQuery.trim() === "") {
      return Object.entries(listValues);
    }
    return Object.entries(listValues).filter(([, label]) =>
      label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [listValues, searchQuery]);

  const handleToggle = (value: string, checked?: boolean) => {
    const currentValue = field.value ?? [];
    if (Array.isArray(currentValue)) {
      const isCurrentlySelected = currentValue.includes(value);
      const shouldSelect = checked ?? !isCurrentlySelected;

      const newValues = shouldSelect
        ? [...currentValue, value]
        : currentValue.filter((v) => v !== value);

      field.onChange(newValues);
    }
  };

  const isSelected = (value: string) => {
    return Array.isArray(currentValue) && currentValue.includes(value);
  };

  return (
    <div key={configKey} className="mb-4 flex flex-col gap-2">
      <Label className="text-sm font-medium">
        {formatKeyForDisplay(configKey)}
      </Label>
      <div className="space-y-2">
        <SearchInput
          name={`search-${configKey}`}
          placeholder={`Search ${formatKeyForDisplay(configKey).toLowerCase()}...`}
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {filteredValues.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery.trim() === ""
                ? "No options available"
                : `No options match "${searchQuery}"`}
            </div>
          ) : (
            filteredValues.map(([value, label]) => (
              <div
                key={value}
                className="group flex cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleToggle(value)}
              >
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={isSelected(value)}
                    onCheckedChange={(checked) =>
                      handleToggle(value, checked === true)
                    }
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    size="xs"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        {!!fieldState.error && (
          <div className={"error flex items-center gap-1 text-xs"}>
            {fieldState.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

function ListConfigurationSection({
  requiredLists,
}: {
  requiredLists: Record<string, Record<string, string>>;
}) {
  if (Object.keys(requiredLists).length === 0) {
    return null;
  }

  return Object.entries(requiredLists).map(([key, listValues]) => (
    <ListConfigurationInput key={key} configKey={key} listValues={listValues} />
  ));
}

interface GroupedConfigurationSectionProps {
  prefix: string;
  requiredStrings: string[];
  requiredNumbers: string[];
  requiredBooleans: string[];
  requiredEnums: Record<string, string[]>;
  requiredLists: Record<string, Record<string, string>>;
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
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0 ||
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

interface AdditionalConfigurationSectionProps {
  requiredStrings: string[];
  requiredNumbers: string[];
  requiredBooleans: string[];
  requiredEnums: Record<string, string[]>;
  requiredLists: Record<string, Record<string, string>>;
}

export function AdditionalConfigurationSection({
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
  requiredEnums,
  requiredLists,
}: AdditionalConfigurationSectionProps) {
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
    () => groupKeysByPrefix(requiredBooleans),
    [requiredBooleans]
  );
  const groupedEnums = useMemo(() => {
    const groups: Record<string, Record<string, string[]>> = {};
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
    const groups: Record<string, Record<string, Record<string, string>>> = {};
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
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0 ||
    Object.keys(requiredEnums).length > 0 ||
    Object.keys(requiredLists).length > 0;

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
            requiredStrings={groupedStrings[prefix] || []}
            requiredNumbers={groupedNumbers[prefix] || []}
            requiredBooleans={groupedBooleans[prefix] || []}
            requiredEnums={groupedEnums[prefix] || {}}
            requiredLists={groupedLists[prefix] || {}}
          />
        ))}
      </ConfigurationSectionContainer>
    </>
  );
}
