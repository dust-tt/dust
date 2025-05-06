import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";

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

interface BooleanConfigurationSectionProps {
  requiredBooleans: string[];
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: boolean) => void;
}

function BooleanConfigurationSection({
  requiredBooleans,
  additionalConfiguration,
  onConfigUpdate,
}: BooleanConfigurationSectionProps) {
  if (requiredBooleans.length === 0) {
    return null;
  }

  return requiredBooleans.map((key) => {
    // Ugly hack but the type of additionalConfiguration is highly dynamic.
    // We make sure to save a boolean value that said.
    const value = !!additionalConfiguration[key];
    return (
      <div key={key} className="mb-2 flex items-center gap-1">
        <Label htmlFor={`boolean-${key}`} className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
        <div className="w-full flex-1">
          <Checkbox
            id={`boolean-${key}`}
            checked={value}
            onCheckedChange={(checked) => onConfigUpdate(key, !!checked)}
          />
        </div>
      </div>
    );
  });
}

interface NumberConfigurationSectionProps {
  requiredNumbers: string[];
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: number) => void;
}

function NumberConfigurationSection({
  requiredNumbers,
  additionalConfiguration,
  onConfigUpdate,
}: NumberConfigurationSectionProps) {
  if (requiredNumbers.length === 0) {
    return null;
  }

  return requiredNumbers.map((key) => {
    const value = additionalConfiguration[key] ?? null;
    return (
      <div key={key} className="mb-2 flex items-center gap-1">
        <Label htmlFor={`number-${key}`} className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
        <Input
          id={`number-${key}`}
          type="number"
          value={value?.toString() || ""}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!isNaN(parsed)) {
              onConfigUpdate(key, parsed);
            }
          }}
          placeholder={`Enter value for ${formatKeyForDisplay(key)}`}
        />
      </div>
    );
  });
}

interface StringConfigurationSectionProps {
  requiredStrings: string[];
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string) => void;
}

function StringConfigurationSection({
  requiredStrings,
  additionalConfiguration,
  onConfigUpdate,
}: StringConfigurationSectionProps) {
  if (requiredStrings.length === 0) {
    return null;
  }

  return requiredStrings.map((key) => {
    const value = additionalConfiguration[key] ?? "";
    return (
      <div key={key} className="mb-2 flex items-center gap-1">
        <Label htmlFor={`string-${key}`} className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
        <Input
          id={`string-${key}`}
          type="text"
          value={value.toString()}
          onChange={(e) => onConfigUpdate(key, e.target.value)}
          placeholder={`Enter value for ${formatKeyForDisplay(key)}`}
        />
      </div>
    );
  });
}

interface EnumConfigurationSectionProps {
  requiredEnums: Record<string, string[]>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string) => void;
}

function EnumConfigurationSection({
  requiredEnums,
  additionalConfiguration,
  onConfigUpdate,
}: EnumConfigurationSectionProps) {
  if (Object.keys(requiredEnums).length === 0) {
    return null;
  }

  return Object.entries(requiredEnums).map(([key, enumValues]) => {
    const displayLabel = `Select ${formatKeyForDisplay(key)}`;
    return (
      <div key={key} className="mb-2 flex items-center gap-1">
        <Label className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              label={additionalConfiguration[key]?.toString() ?? displayLabel}
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
                onSelect={() => onConfigUpdate(key, enumValue)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  });
}

interface GroupedConfigurationSectionProps {
  prefix: string;
  requiredStrings: string[];
  requiredNumbers: string[];
  requiredBooleans: string[];
  requiredEnums: Record<string, string[]>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string | number | boolean) => void;
}

function GroupedConfigurationSection({
  prefix,
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
  requiredEnums,
  additionalConfiguration,
  onConfigUpdate,
}: GroupedConfigurationSectionProps) {
  const hasConfiguration =
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0;

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
          requiredStrings={requiredStrings}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={(key, value) => onConfigUpdate(key, value)}
        />
        <NumberConfigurationSection
          requiredNumbers={requiredNumbers}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={(key, value) => onConfigUpdate(key, value)}
        />
        <BooleanConfigurationSection
          requiredBooleans={requiredBooleans}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={(key, value) => onConfigUpdate(key, value)}
        />
        <EnumConfigurationSection
          requiredEnums={requiredEnums}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={(key, value) => onConfigUpdate(key, value)}
        />
      </div>
    </div>
  );
}

interface AdditionalConfigurationSectionProps {
  requiredStrings: string[];
  requiredNumbers: string[];
  requiredBooleans: string[];
  requiredEnums: Record<string, string[]>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string | number | boolean) => void;
}

export const AdditionalConfigurationSection: React.FC<
  AdditionalConfigurationSectionProps
> = ({
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
  requiredEnums,
  additionalConfiguration,
  onConfigUpdate,
}) => {
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

  // Get all unique prefixes
  const allPrefixes = useMemo(() => {
    const prefixSet = new Set<string>();

    Object.keys(groupedStrings).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedNumbers).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedBooleans).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedEnums).forEach((prefix) => prefixSet.add(prefix));

    return Array.from(prefixSet).sort();
  }, [groupedStrings, groupedNumbers, groupedBooleans, groupedEnums]);

  const hasConfiguration =
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0 ||
    Object.keys(requiredEnums).length > 0;

  if (!hasConfiguration) {
    return null;
  }

  return (
    <>
      <div className="mt-6 w-full">
        <Label className="text-lg font-medium text-foreground dark:text-foreground-night">
          Additional configuration
        </Label>
        <br />
        <Label className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
          Configure additional parameters required by this action.
        </Label>
      </div>

      {allPrefixes.map((prefix) => (
        <GroupedConfigurationSection
          key={prefix || "general"}
          prefix={prefix}
          requiredStrings={groupedStrings[prefix] || []}
          requiredNumbers={groupedNumbers[prefix] || []}
          requiredBooleans={groupedBooleans[prefix] || []}
          requiredEnums={groupedEnums[prefix] || {}}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={onConfigUpdate}
        />
      ))}
    </>
  );
};
