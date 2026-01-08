import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { DustAppSection } from "@app/components/agent_builder/capabilities/shared/DustAppSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { SecretSection } from "@app/components/agent_builder/capabilities/shared/SecretSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";

export interface MCPServerConfigurationPageProps {
  form: UseFormReturn<MCPFormData>;
  action: BuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
  getAgentInstructions: () => string;
}

export function MCPServerConfigurationPage({
  form,
  action,
  mcpServerView,
  getAgentInstructions,
}: MCPServerConfigurationPageProps) {
  const requirements = useMemo(() => {
    return getMCPServerRequirements(mcpServerView);
  }, [mcpServerView]);

  return (
    <FormProvider form={form} className="h-full">
      <div className="h-full space-y-6 pt-3">
        {action.configurationRequired && (
          <NameSection
            title="Name"
            placeholder="My tool name…"
            triggerValidationOnChange
          />
        )}
        {requirements.requiresChildAgentConfiguration && <ChildAgentSection />}
        {requirements.mayRequireTimeFrameConfiguration && (
          <TimeFrameSection actionType="search" />
        )}
        {requirements.requiresDustAppConfiguration && <DustAppSection />}
        {requirements.developerSecretSelection && (
          <SecretSection
            customDescription={
              mcpServerView.server.developerSecretSelectionDescription ??
              undefined
            }
          />
        )}
        {requirements.mayRequireJsonSchemaConfiguration && (
          <JsonSchemaSection getAgentInstructions={getAgentInstructions} />
        )}
        <AdditionalConfigurationSection
          requiredStrings={requirements.requiredStrings}
          requiredNumbers={requirements.requiredNumbers}
          requiredBooleans={requirements.requiredBooleans}
          requiredEnums={requirements.requiredEnums}
          requiredLists={requirements.requiredLists}
        />
      </div>
    </FormProvider>
  );
}
