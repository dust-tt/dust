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
  selectionSummaries?: SelectionSummary[];
  showNameSection: boolean;
  additionalConfigs: AdditionalConfigs;
}

export function MCPAdditionalConfigurationPage({
  selectionSummaries = [],
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

        {selectionSummaries.length > 0 && (
          <ConfigurationSectionContainer title="Selection" description="">
            {selectionSummaries.map((s) => (
              <Card key={s.id} size="sm" className="w-full">
                <div className="flex w-full">
                  <div className="flex w-full flex-grow flex-col gap-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      {s.visual.type === "icon" ? (
                        <CommandLineIcon className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <Avatar
                          size="sm"
                          name={s.visual.name}
                          visual={s.visual.pictureUrl}
                        />
                      )}
                      <div className="text-md font-medium">{s.title}</div>
                    </div>
                    {s.description && (
                      <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                        {s.description}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 self-start">
                    <Button
                      variant="outline"
                      size="sm"
                      label={s.editLabel}
                      onClick={s.onEdit}
                    />
                  </div>
                </div>
              </Card>
            ))}
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
