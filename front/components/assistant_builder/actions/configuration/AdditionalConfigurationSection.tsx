import { Checkbox, Input, Label } from "@dust-tt/sparkle";
import React from "react";

import { asDisplayName } from "@app/types";

const formatKeyForDisplay = (key: string): string => {
  const lastPart = key.split(".").pop() || key;
  return asDisplayName(lastPart);
};

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
      <div key={key} className="flex items-center gap-2">
        <Checkbox
          id={`boolean-${key}`}
          checked={value}
          onCheckedChange={(checked) => onConfigUpdate(key, !!checked)}
        />
        <Label htmlFor={`boolean-${key}`} className="text-sm font-medium">
          {formatKeyForDisplay(key)}
        </Label>
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
      <div key={key} className="flex flex-col gap-2">
        <Label htmlFor={`number-${key}`} className="text-sm font-medium">
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
      <div key={key} className="flex flex-col gap-2">
        <Label htmlFor={`string-${key}`} className="text-sm font-medium">
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
  const hasConfiguration =
    Object.keys(requiredStrings).length > 0 ||
    Object.keys(requiredNumbers).length > 0 ||
    Object.keys(requiredBooleans).length > 0;

  if (!hasConfiguration) {
    return null;
  }

  return (
    <>
      <div className="mt-6">
        <Label className="text-lg font-medium text-foreground dark:text-foreground-night">
          Additional configuration
        </Label>
        <br />
        <Label className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
          Configure additional parameters required by this action.
        </Label>
      </div>

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
    </>
  );
};
