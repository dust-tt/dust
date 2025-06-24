import {
  Card,
  CommandLineIcon,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import { sortBy } from "lodash";
import React, { useMemo, useState } from "react";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import { useApps } from "@app/lib/swr/apps";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface DustAppConfigurationSectionProps {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
  selectedConfig: DustAppRunConfigurationType | null;
  onConfigSelect: (config: DustAppRunConfigurationType) => void;
}

export function DustAppConfigurationSection({
  owner,
  allowedSpaces,
  selectedConfig,
  onConfigSelect,
}: DustAppConfigurationSectionProps) {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>(() => {
    if (selectedConfig && selectedConfig.spaceId) {
      return selectedConfig.spaceId;
    }
    return allowedSpaces[0]?.sId;
  });

  return (
    <ConfigurationSectionContainer title="Select a Dust App">
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        The agent will execute a{" "}
        <a
          href="https://docs.dust.tt"
          target="_blank"
          rel="noreferrer"
          className="font-bold"
        >
          Dust Application
        </a>{" "}
        of your design before replying. The output of the app (last block) is
        injected in context for the model to generate an answer.
      </div>

      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Dust apps without a description are not selectable. To make a Dust App
        selectable, edit it and add a description.
      </div>

      {isSpacesLoading ? (
        <Spinner />
      ) : (
        <SpaceSelector
          spaces={spaces}
          allowedSpaces={allowedSpaces}
          selectedSpace={selectedSpaceId}
          onSpaceChange={setSelectedSpaceId}
          renderChildren={(space) => {
            if (!space) {
              return (
                <ContentMessage
                  title="You don't have any Dust Application available"
                  icon={InformationCircleIcon}
                  variant="warning"
                >
                  <div className="flex flex-col gap-y-3">
                    {owner.role === "admin" || owner.role === "builder" ? (
                      <div>
                        <strong>
                          Visit the "Developer Tools" section in the Build panel
                          to build your first Dust Application.
                        </strong>
                      </div>
                    ) : owner.role === "user" ? (
                      <div>
                        <strong>
                          Only Admins and Builders can build Dust Applications.
                        </strong>
                      </div>
                    ) : null}
                  </div>
                </ContentMessage>
              );
            }

            return (
              <SpaceAppsRadioGroup
                owner={owner}
                space={space}
                selectedConfig={selectedConfig}
                onConfigSelect={onConfigSelect}
              />
            );
          }}
        />
      )}
    </ConfigurationSectionContainer>
  );
}

interface SpaceAppsRadioGroupProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  selectedConfig: DustAppRunConfigurationType | null;
  onConfigSelect: (config: DustAppRunConfigurationType) => void;
}

export function SpaceAppsRadioGroup({
  owner,
  space,
  selectedConfig,
  onConfigSelect,
}: SpaceAppsRadioGroupProps) {
  const { apps, isAppsLoading } = useApps({ owner, space });

  const sortedApps = useMemo(
    () =>
      sortBy(apps, [
        (app) => !app.description || app.description.length === 0,
        "name",
      ]),
    [apps]
  );

  if (isAppsLoading) {
    return <Spinner />;
  }

  if (sortedApps.length === 0) {
    return <>No Dust Apps available.</>;
  }

  return (
    <RadioGroup defaultValue={selectedConfig?.appId || undefined}>
      {sortedApps.map((app, idx, arr) => (
        <React.Fragment key={app.sId}>
          <RadioGroupCustomItem
            value={app.sId}
            id={app.sId}
            disabled={!app.description || app.description.length === 0}
            iconPosition="start"
            customItem={
              <Label htmlFor={app.sId} className="w-full font-normal">
                <Card
                  variant="tertiary"
                  size="sm"
                  onClick={() => {
                    if (app.description && app.description.length > 0) {
                      onConfigSelect({
                        id: app.id,
                        sId: app.sId,
                        appId: app.sId,
                        appWorkspaceId: owner.sId,
                        name: app.name,
                        description: app.description,
                        type: "dust_app_run_configuration",
                        spaceId: app.space.sId,
                      });
                    }
                  }}
                  disabled={!app.description || app.description.length === 0}
                  className={
                    !app.description || app.description.length === 0
                      ? "opacity-50"
                      : ""
                  }
                >
                  <div className="flex flex-row items-center gap-2">
                    <Icon visual={CommandLineIcon} size="md" />
                    <div className="flex flex-grow items-center justify-between overflow-hidden truncate">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                          {app.name}
                        </div>
                        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                          {app.description || "No description"}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Label>
            }
            onClick={() => {
              if (app.description && app.description.length > 0) {
                onConfigSelect({
                  id: app.id,
                  sId: app.sId,
                  appId: app.sId,
                  appWorkspaceId: owner.sId,
                  name: app.name,
                  description: app.description,
                  type: "dust_app_run_configuration",
                  spaceId: app.space.sId,
                });
              }
            }}
          />
          {idx !== arr.length - 1 && <Separator />}
        </React.Fragment>
      ))}
    </RadioGroup>
  );
}
