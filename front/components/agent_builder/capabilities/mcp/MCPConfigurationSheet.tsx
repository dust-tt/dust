import {
  ScrollArea,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FormEvent } from "react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderDataVizAction,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/formValidation";
import { MCPActionHeader } from "@app/components/agent_builder/capabilities/mcp/MCPActionHeader";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { DustAppSection } from "@app/components/agent_builder/capabilities/shared/DustAppSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { ReasoningModelSection } from "@app/components/agent_builder/capabilities/shared/ReasoningModelSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { WorkspaceType } from "@app/types";

interface MCPConfigurationSheetProps {
  selectedAction?: AgentBuilderAction | AgentBuilderDataVizAction | null;
  onSave: (action: AgentBuilderAction | AgentBuilderDataVizAction) => void;
  isOpen: boolean;
  onClose: () => void;
  getAgentInstructions: () => string;
}

// This sheet is for any MCP tools without datasource selection required,
// until we refactor KnowledgeConfigurationSheet.
export function MCPConfigurationSheet({
  selectedAction,
  onSave,
  isOpen,
  onClose,
  getAgentInstructions,
}: MCPConfigurationSheetProps) {
  const handleClose = () => {
    onClose();
  };

  if (!isOpen || !selectedAction || selectedAction.type !== "MCP") {
    return null;
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <MCPConfigurationSheetContent
        action={selectedAction}
        onClose={handleClose}
        onSave={onSave}
        getAgentInstructions={getAgentInstructions}
      />
    </Sheet>
  );
}

interface MCPConfigurationSheetContentProps {
  action: AgentBuilderAction;
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
  getAgentInstructions: () => string;
}

function MCPConfigurationSheetContent({
  action,
  onSave,
  onClose,
  getAgentInstructions,
}: MCPConfigurationSheetContentProps) {
  const { owner } = useAgentBuilderContext();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const agentInstructions = getAgentInstructions();

  const mcpServerView =
    action.type === "MCP" && !isMCPServerViewsLoading
      ? mcpServerViews.find(
          (view) => view.sId === action.configuration.mcpServerViewId
        )
      : null;

  const formSchema = useMemo(
    () => getMCPConfigurationFormSchema(mcpServerView),
    [mcpServerView]
  );

  const form = useForm<MCPFormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      action.type === "MCP"
        ? {
            name: action.name ?? "",
            description: action.description ?? "",
            configuration: action.configuration,
          }
        : {},
  });

  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const isValid = await form.trigger();

    if (isValid) {
      const formData = form.getValues();
      const updatedAction: AgentBuilderAction = {
        ...action,
        name: formData.name,
        description: formData.description,
        configuration: formData.configuration as any, // TODO: fix me
      };

      onSave(updatedAction);
      onClose();
    }
  };

  if (!mcpServerView || !requirements) {
    return null;
  }

  const allowNameEdit = !action.noConfigurationRequired;

  return (
    <SheetContent size="lg">
      <SheetContainer>
        <FormProvider form={form}>
          <div className="w-full">
            <MCPActionHeader
              mcpServerView={mcpServerView}
              action={action}
              allowNameEdit={allowNameEdit}
            />
            <div className="mt-6">
              <ScrollArea className="h-full">
                <MCPConfigurationForm
                  mcpServerView={mcpServerView}
                  requirements={requirements}
                  owner={owner}
                  agentInstructions={agentInstructions}
                />
              </ScrollArea>
            </div>
          </div>
        </FormProvider>
      </SheetContainer>
      <SheetFooter
        leftButtonProps={{
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        }}
        rightButtonProps={{
          label: "Save",
          onClick: handleSave,
        }}
      />
    </SheetContent>
  );
}

interface MCPConfigurationFormProps {
  mcpServerView: MCPServerViewType;
  requirements: ReturnType<typeof getMCPServerRequirements>;
  owner: WorkspaceType;
  agentInstructions: string;
}

function MCPConfigurationForm({
  mcpServerView,
  requirements,
  owner,
  agentInstructions,
}: MCPConfigurationFormProps) {
  const { spaces } = useSpacesContext();

  const allowedSpaces = spaces.filter(
    (space) => space.sId === mcpServerView.spaceId || space.kind === "system"
  );

  const selectedServerAvailability = mcpServerView?.server.availability ?? null;
  const spaceName = spaces.find(
    (space) => space.sId === mcpServerView?.spaceId
  )?.name;

  return (
    <div className="flex flex-col gap-6">
      {selectedServerAvailability === "manual" && spaceName && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          Available to you via <b>{spaceName}</b> space.
        </div>
      )}

      {requirements.requiresChildAgentConfiguration && (
        <ChildAgentSection owner={owner} />
      )}

      {requirements.requiresReasoningConfiguration && (
        <ReasoningModelSection owner={owner} />
      )}

      {requirements.requiresDustAppConfiguration && (
        <DustAppSection owner={owner} allowedSpaces={allowedSpaces} />
      )}

      {requirements.mayRequireTimeFrameConfiguration && (
        <TimeFrameSection actionType="extract" />
      )}

      {requirements.mayRequireJsonSchemaConfiguration && (
        <JsonSchemaSection
          owner={owner}
          agentInstructions={agentInstructions}
        />
      )}

      <AdditionalConfigurationSection {...requirements} />
    </div>
  );
}
