import { Avatar, Button, Card, CommandLineIcon } from "@dust-tt/sparkle";
import React from "react";

import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import type { MCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";

export type SelectionSummary = {
  id: string;
  visual:
    | { type: "icon" }
    | { type: "avatar"; name: string; pictureUrl?: string | null };
  title: string;
  description?: string;
  editLabel: string;
  onEdit: () => void;
};

export type AdditionalConfigs = Pick<
  MCPServerToolsConfigurations,
  | "stringConfigurations"
  | "numberConfigurations"
  | "booleanConfigurations"
  | "enumConfigurations"
  | "listConfigurations"
>;

interface MCPAdditionalConfigurationPageProps {
  selectionSummary?: SelectionSummary | null;
  showNameSection: boolean;
  additionalConfigs: AdditionalConfigs;
}

export function MCPAdditionalConfigurationPage({
  selectionSummary = null,
  showNameSection,
  additionalConfigs,
}: MCPAdditionalConfigurationPageProps) {
  return (
    <div className="h-full">
      <div className="h-full space-y-6 pt-3">
        {showNameSection && (
          <NameSection
            title="Name"
            placeholder="My tool name…"
            triggerValidationOnChange
          />
        )}

        {selectionSummary && (
          <ConfigurationSectionContainer title="Selection" description="">
            <Card key={selectionSummary.id} size="sm" className="w-full">
              <div className="flex w-full">
                <div className="flex w-full flex-grow flex-col gap-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    {selectionSummary.visual.type === "icon" ? (
                      <CommandLineIcon className="h-6 w-6 text-muted-foreground" />
                    ) : (
                      <Avatar
                        size="sm"
                        name={selectionSummary.visual.name}
                        visual={selectionSummary.visual.pictureUrl}
                      />
                    )}
                    <div className="text-md font-medium">
                      {selectionSummary.title}
                    </div>
                  </div>
                  {selectionSummary.description && (
                    <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {selectionSummary.description}
                    </div>
                  )}
                </div>
                <div className="ml-4 self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    label={selectionSummary.editLabel}
                    onClick={selectionSummary.onEdit}
                  />
                </div>
              </div>
            </Card>
          </ConfigurationSectionContainer>
        )}

        <AdditionalConfigurationSection
          stringConfigurations={additionalConfigs.stringConfigurations}
          numberConfigurations={additionalConfigs.numberConfigurations}
          booleanConfigurations={additionalConfigs.booleanConfigurations}
          enumConfigurations={additionalConfigs.enumConfigurations}
          listConfigurations={additionalConfigs.listConfigurations}
        />
      </div>
    </div>
  );
}
