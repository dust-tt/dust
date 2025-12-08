import {
  Button,
  CardGrid,
  EmptyCTA,
  Spinner,
  ToolsIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type { SheetMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { MCPServerViewsSheet } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";

export function SkillBuilderToolsSection() {
  const { getValues } = useFormContext<SkillBuilderFormData>();
  const { fields, remove, append } = useFieldArray<
    SkillBuilderFormData,
    "tools"
  >({
    name: "tools",
  });
  const { owner } = useSkillBuilderContext();

  const { isMCPServerViewsLoading } = useMCPServerViewsContext();

  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);

  // Filter to only show tools that don't require configuration
  const filterNoConfigTools = useCallback(
    (view: MCPServerViewTypeWithLabel) => {
      const requirements = getMCPServerRequirements(view);
      return requirements.noRequirement;
    },
    []
  );

  // Get already selected tools as AgentBuilderAction[] for the sheet
  const selectedActionsForSheet = useMemo(() => {
    return getValues("tools");
  }, [getValues]);

  const handleOpenSheet = () => {
    setSheetMode({ type: "add" });
  };

  const headerActions = fields.length > 0 && (
    <Button
      type="button"
      onClick={handleOpenSheet}
      label="Add tools"
      icon={ToolsIcon}
      variant="outline"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
            Tools
          </h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Add tools to enhance your skill's abilities.
          </p>
        </div>
        {headerActions}
      </div>

      <div className="flex-1">
        {isMCPServerViewsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : fields.length === 0 ? (
          <EmptyCTA
            action={
              <Button
                type="button"
                onClick={handleOpenSheet}
                label="Add tools"
                icon={ToolsIcon}
                variant="outline"
              />
            }
            className="pb-5"
          />
        ) : (
          <CardGrid>
            {fields.map((field, index) => (
              <ActionCard
                key={field.id}
                action={field}
                onRemove={() => remove(index)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      <MCPServerViewsSheet
        owner={owner}
        addTools={append}
        mode={sheetMode}
        onModeChange={setSheetMode}
        selectedActions={selectedActionsForSheet}
        getAgentInstructions={() => ""}
        filterMCPServerViews={filterNoConfigTools}
      />
    </div>
  );
}
