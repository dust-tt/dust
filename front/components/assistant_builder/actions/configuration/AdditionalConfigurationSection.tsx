import { Checkbox, Input, Label } from "@dust-tt/sparkle";
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

function groupKeysByPrefix<T extends string | number | boolean>(
  keys: Record<string, T>
): Record<string, Record<string, T>> {
  const groups: Record<string, Record<string, T>> = {};

  Object.entries(keys).forEach(([key, value]) => {
    const prefix = getKeyPrefix(key);
    if (!groups[prefix]) {
      groups[prefix] = {};
    }
    groups[prefix][key] = value;
  });

  return groups;
}

interface BooleanConfigurationSectionProps {
  requiredBooleans: Record<string, boolean>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: boolean) => void;
}

function BooleanConfigurationSection({
  requiredBooleans,
  additionalConfiguration,
  onConfigUpdate,
}: BooleanConfigurationSectionProps) {
  if (Object.keys(requiredBooleans).length === 0) {
    return null;
  }

  return Object.entries(requiredBooleans).map(([key, defaultValue]) => {
    const value = (additionalConfiguration[key] as boolean) ?? defaultValue;
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
  requiredNumbers: Record<string, number>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: number) => void;
}

function NumberConfigurationSection({
  requiredNumbers,
  additionalConfiguration,
  onConfigUpdate,
}: NumberConfigurationSectionProps) {
  if (Object.keys(requiredNumbers).length === 0) {
    return null;
  }

  return Object.entries(requiredNumbers).map(([key, defaultValue]) => {
    const value = additionalConfiguration[key] ?? defaultValue;
    return (
      <div key={key} className="mb-2 flex items-center gap-1">
        <Label htmlFor={`number-${key}`} className="w-1/5 text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
        <Input
          id={`number-${key}`}
          type="number"
          value={value.toString()}
          onChange={(e) => onConfigUpdate(key, parseFloat(e.target.value))}
          placeholder={`Enter value for ${formatKeyForDisplay(key)}`}
        />
      </div>
    );
  });
}

interface StringConfigurationSectionProps {
  requiredStrings: Record<string, string>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string) => void;
}

function StringConfigurationSection({
  requiredStrings,
  additionalConfiguration,
  onConfigUpdate,
}: StringConfigurationSectionProps) {
  if (Object.keys(requiredStrings).length === 0) {
    return null;
  }

  return Object.entries(requiredStrings).map(([key, defaultValue]) => {
    const value = additionalConfiguration[key] ?? defaultValue;
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

interface GroupedConfigurationSectionProps {
  prefix: string;
  requiredStrings: Record<string, string>;
  requiredNumbers: Record<string, number>;
  requiredBooleans: Record<string, boolean>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string | number | boolean) => void;
}

function GroupedConfigurationSection({
  prefix,
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
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
      </div>
    </div>
  );
}

interface AdditionalConfigurationSectionProps {
  requiredStrings: Record<string, string>;
  requiredNumbers: Record<string, number>;
  requiredBooleans: Record<string, boolean>;
  additionalConfiguration: Record<string, string | number | boolean>;
  onConfigUpdate: (key: string, value: string | number | boolean) => void;
}

export const AdditionalConfigurationSection: React.FC<
  AdditionalConfigurationSectionProps
> = ({
  requiredStrings,
  requiredNumbers,
  requiredBooleans,
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

  // Get all unique prefixes
  const allPrefixes = useMemo(() => {
    const prefixSet = new Set<string>();

    Object.keys(groupedStrings).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedNumbers).forEach((prefix) => prefixSet.add(prefix));
    Object.keys(groupedBooleans).forEach((prefix) => prefixSet.add(prefix));

    return Array.from(prefixSet).sort();
  }, [groupedStrings, groupedNumbers, groupedBooleans]);

  const hasConfiguration =
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0;

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
          requiredStrings={groupedStrings[prefix] || {}}
          requiredNumbers={groupedNumbers[prefix] || {}}
          requiredBooleans={groupedBooleans[prefix] || {}}
          additionalConfiguration={additionalConfiguration}
          onConfigUpdate={onConfigUpdate}
        />
      ))}
    </>
  );
};
