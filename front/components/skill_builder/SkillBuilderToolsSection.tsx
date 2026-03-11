import type { SheetMode } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { MCPServerViewsSheet } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { ActionCard } from "@app/components/shared/tools_picker/ActionCard";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { getSkillIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  ArrowGoBackIcon,
  Button,
  CardGrid,
  Chip,
  EmptyCTA,
  Spinner,
  ToolsIcon,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

interface SkillBuilderToolsSectionProps {
  extendedSkill?: SkillType;
}

export function SkillBuilderToolsSection({
  extendedSkill,
}: SkillBuilderToolsSectionProps) {
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();

  const { fields, remove, append } = useFieldArray<
    SkillBuilderFormData,
    "tools"
  >({
    name: "tools",
  });
  const { isMCPServerViewsLoading } = useMCPServerViewsContext();

  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);

  const filterNoConfigTools = useCallback(
    (view: MCPServerViewTypeWithLabel) => {
      const requirements = getMCPServerRequirements(view);
      return requirements.noRequirement;
    },
    []
  );

  const selectedActionsForSheet = fields;

  const handleOpenSheet = () => {
    setSheetMode({ type: "add" });
  };

  const handleClickActionCard = (action: BuilderAction) => {
    setSheetMode({ type: "info", action, source: "addedTool" });
  };

  const currentToolIds = useMemo(
    () => new Set(fields.map((f) => f.configuration.mcpServerViewId)),
    [fields]
  );

  const compareToolIds = useMemo(
    () =>
      compareVersion
        ? new Set(compareVersion.tools.map((t) => t.sId))
        : new Set<string>(),
    [compareVersion]
  );

  const toolsDiffer =
    isDiffMode &&
    (currentToolIds.size !== compareToolIds.size ||
      [...currentToolIds].some((id) => !compareToolIds.has(id)));

  const restoreTools = () => {
    if (!compareVersion) {
      return;
    }
    setValue("tools", compareVersion.tools.map(getDefaultMCPAction), {
      shouldDirty: true,
    });
  };

  const headerActions = !isDiffMode && fields.length > 0 && (
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
        <div className="flex items-center gap-2">
          <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
            Tools
          </h3>
          {extendedSkill && (
            <Chip
              color="highlight"
              size="xs"
              icon={getSkillIcon(extendedSkill.icon)}
              label={`Already includes tools from ${extendedSkill.name}`}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolsDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowGoBackIcon}
              onClick={restoreTools}
              label="Restore tools"
            />
          )}
          {headerActions}
        </div>
      </div>

      <div className="flex-1">
        {isMCPServerViewsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : fields.length === 0 ? (
          isDiffMode ? null : (
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
              className="py-8"
            />
          )
        ) : (
          <CardGrid>
            {fields.map((field, index) => {
              if (!isDiffMode) {
                return (
                  <ActionCard
                    key={field.id}
                    action={field}
                    onRemove={() => remove(index)}
                    onClick={() => handleClickActionCard(field)}
                  />
                );
              }
              const isAdded = !compareToolIds.has(
                field.configuration.mcpServerViewId
              );
              if (isAdded) {
                return (
                  <ActionCard
                    key={field.id}
                    action={field}
                    diffStatus="added"
                  />
                );
              }
              return <ActionCard key={field.id} action={field} />;
            })}
          </CardGrid>
        )}
      </div>

      {!isDiffMode && (
        <MCPServerViewsSheet
          addTools={append}
          mode={sheetMode}
          onModeChange={setSheetMode}
          selectedActions={selectedActionsForSheet}
          getAgentInstructions={() => ""}
          filterMCPServerViews={filterNoConfigTools}
        />
      )}
    </div>
  );
}
