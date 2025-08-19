import type { AdditionalConfigurationInBuilderType } from "@app/components/agent_builder/AgentBuilderFormContext";

export const setValueAtPathInAdditionalConfiguration = ({
  additionalConfiguration,
  path,
  value,
}: {
  additionalConfiguration: AdditionalConfigurationInBuilderType;
  path: string;
  value: boolean | number | string | string[];
}) => {
  const keys = path.split(".");
  let current = additionalConfiguration;
  for (const key of keys.slice(0, -1)) {
    current[key] = current[key] || {};
    current = current[key] as AdditionalConfigurationInBuilderType;
  }

  current[keys[keys.length - 1]] = value;
};
