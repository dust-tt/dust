import { Avatar, Button, Card, CommandLineIcon, Icon } from "@dust-tt/sparkle";
import React from "react";

import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { MCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ModelProviderIdType } from "@app/types";

export type SelectionSummary = {
  id: string;
  visual:
    | { type: "icon" }
    | { type: "avatar"; name: string; pictureUrl?: string | null }
    | { type: "provider-logo"; providerId: ModelProviderIdType };
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
  const { isDark } = useTheme();
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
                    {selectionSummary.visual.type === "avatar" && (
                      <Avatar
                        size="sm"
                        name={selectionSummary.visual.name}
                        visual={selectionSummary.visual.pictureUrl}
                      />
                    )}
                    {selectionSummary.visual.type === "provider-logo" &&
                      (() => {
                        const Logo = getModelProviderLogo(
                          selectionSummary.visual.providerId,
                          isDark
                        );
                        return Logo ? (
                          <Icon visual={Logo} size="lg" />
                        ) : (
                          <CommandLineIcon className="h-6 w-6 text-muted-foreground" />
                        );
                      })()}
                    {selectionSummary.visual.type === "icon" && (
                      <CommandLineIcon className="h-6 w-6 text-muted-foreground" />
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
