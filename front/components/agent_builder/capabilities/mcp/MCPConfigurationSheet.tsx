import {
  Label,
  ScrollArea,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/formValidation";
import { MCPActionHeader } from "@app/components/agent_builder/capabilities/mcp/MCPActionHeader";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/mcp/sections/AdditionalConfigurationSection";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { JsonSchemaConfigurationSection } from "@app/components/assistant_builder/actions/configuration/JsonSchemaConfigurationSection";
import { TimeFrameConfigurationSection } from "@app/components/assistant_builder/actions/configuration/TimeFrameConfigurationSection";
import { generateSchema } from "@app/components/assistant_builder/actions/MCPAction";
import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { TimeFrame, WorkspaceType } from "@app/types";

import { ChildAgentSection } from "./sections/ChildAgentSection";
import { DustAppSection } from "./sections/DustAppSection";
import { ReasoningModelSection } from "./sections/ReasoningModelSection";

interface MCPConfigurationSheetProps {
  selectedAction: AgentBuilderAction | null;
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function MCPConfigurationSheet({
  selectedAction,
  onSave,
  isOpen,
  onClose,
}: MCPConfigurationSheetProps) {
  const { owner } = useAgentBuilderContext();

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
      <DataSourceViewsProvider owner={owner}>
        <MCPConfigurationSheetContent
          action={selectedAction}
          onClose={handleClose}
          onSave={onSave}
        />
      </DataSourceViewsProvider>
    </Sheet>
  );
}

interface MCPConfigurationSheetContentProps {
  action: AgentBuilderAction;
  onSave: (action: AgentBuilderAction) => void;
  onClose: () => void;
}

function MCPConfigurationSheetContent({
  action,
  onSave,
  onClose,
}: MCPConfigurationSheetContentProps) {
  const { owner } = useAgentBuilderContext();
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

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
                  form={form}
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
  form: UseFormReturn<MCPFormData>;
}

function MCPConfigurationForm({
  mcpServerView,
  requirements,
  owner,
  form,
}: MCPConfigurationFormProps) {
  const { spaces } = useSpacesContext();
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showTablesModal, setShowTablesModal] = useState(false);

  const configuration = form.watch("configuration");

  const handleConfigUpdate = useCallback(
    (getNewConfig: (old: typeof configuration) => typeof configuration) => {
      const newConfig = getNewConfig(configuration);
      form.setValue("configuration", newConfig, { shouldDirty: true });
    },
    [configuration, form]
  );

  const allowedSpaces = spaces.filter(
    (space) => space.sId === mcpServerView.spaceId || space.kind === "system"
  );

  const withDataSource =
    requirements.requiresDataSourceConfiguration ||
    requirements.requiresTableConfiguration;

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

      {withDataSource && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description *</Label>
          <TextArea
            id="description"
            {...form.register("description")}
            placeholder="Describe what this action does..."
            rows={3}
          />
          {form.formState.errors.description && (
            <p className="text-sm text-red-500">
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
      )}

      {requirements.requiresDataSourceConfiguration && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={(dataSourceConfigurations: any) => {
            handleConfigUpdate((old) => ({ ...old, dataSourceConfigurations }));
          }}
          initialDataSourceConfigurations={
            configuration.dataSourceConfigurations ?? {}
          }
          allowedSpaces={allowedSpaces}
          viewType="document"
        />
      )}

      {requirements.requiresTableConfiguration && (
        <AssistantBuilderDataSourceModal
          isOpen={showTablesModal}
          setOpen={setShowTablesModal}
          owner={owner}
          onSave={(tablesConfigurations: any) => {
            handleConfigUpdate((old) => ({ ...old, tablesConfigurations }));
          }}
          initialDataSourceConfigurations={
            configuration.tablesConfigurations ?? {}
          }
          allowedSpaces={allowedSpaces}
          viewType="table"
        />
      )}

      {requirements.requiresDataSourceConfiguration && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            configuration.dataSourceConfigurations ?? {}
          }
          openDataSourceModal={() => setShowDataSourcesModal(true)}
          onSave={(dataSourceConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, dataSourceConfigurations }));
          }}
          viewType="document"
        />
      )}

      {requirements.requiresTableConfiguration && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={configuration.tablesConfigurations ?? {}}
          openDataSourceModal={() => setShowTablesModal(true)}
          onSave={(tablesConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, tablesConfigurations }));
          }}
          viewType="table"
        />
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
        <TimeFrameConfigurationSection
          onConfigUpdate={(timeFrame: TimeFrame | null) => {
            handleConfigUpdate((old) => ({ ...old, timeFrame }));
          }}
          timeFrame={configuration.timeFrame}
          error={form.formState.errors.configuration?.timeFrame?.message}
        />
      )}

      {requirements.mayRequireJsonSchemaConfiguration && (
        <JsonSchemaConfigurationSection
          instructions={form.watch("description")}
          description={form.watch("description")}
          sectionConfigurationDescription="Optionally, provide a schema for the data to be extracted. If you do not specify a schema, the tool will determine the schema based on the conversation context."
          setEdited={() => form.setValue("_isDirty", true)}
          onConfigUpdate={({ jsonSchema, _jsonSchemaString }) => {
            handleConfigUpdate((old) => ({
              ...old,
              _jsonSchemaString,
              jsonSchema:
                jsonSchema === undefined ? old.jsonSchema : jsonSchema,
            }));
          }}
          initialSchema={
            configuration._jsonSchemaString ??
            (configuration.jsonSchema
              ? JSON.stringify(configuration.jsonSchema, null, 2)
              : null)
          }
          generateSchema={(instructions: string) =>
            generateSchema({ owner, instructions })
          }
        />
      )}

      <AdditionalConfigurationSection {...requirements} />
    </div>
  );
}
