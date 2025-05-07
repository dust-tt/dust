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
import { useContext, useMemo } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";

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
  const { dustApps } = useContext(AssistantBuilderContext);
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });

  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) =>
        dustApps.some((app) => app.space.sId === space.sId)
      ),
    [spaces, dustApps]
  );

  const sortedApps = useMemo(
    () =>
      sortBy(dustApps, [
        (app) => !app.description || app.description.length === 0,
        "name",
      ]),
    [dustApps]
  );

  if (dustApps.length === 0) {
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
                Visit the "Developer Tools" section in the Build panel to build
                your first Dust Application.
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
    <div className="flex flex-col gap-4">
      <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Select a Dust App
      </div>

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

      {sortedApps.some(
        (app) => !app.description || app.description.length === 0
      ) && (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Dust apps without a description are not selectable. To make a Dust App
          selectable, edit it and add a description.
        </div>
      )}

      {isSpacesLoading ? (
        <Spinner />
      ) : (
        <SpaceSelector
          spaces={filteredSpaces}
          allowedSpaces={allowedSpaces}
          defaultSpace={allowedSpaces[0]?.sId}
          renderChildren={(space) => {
            const appsInSpace = space
              ? sortedApps.filter((app) => app.space.sId === space.sId)
              : sortedApps;

            if (appsInSpace.length === 0) {
              return <>No Dust Apps available.</>;
            }

            return (
              <RadioGroup defaultValue={selectedConfig?.appId || undefined}>
                {appsInSpace.map((app, idx, arr) => (
                  <div key={app.sId}>
                    <RadioGroupCustomItem
                      value={app.sId}
                      id={app.sId}
                      disabled={
                        !app.description || app.description.length === 0
                      }
                      iconPosition="start"
                      customItem={
                        <Label htmlFor={app.sId} className="font-normal">
                          <Card
                            variant="tertiary"
                            size="sm"
                            onClick={() => {
                              if (
                                app.description &&
                                app.description.length > 0
                              ) {
                                onConfigSelect({
                                  id: app.id,
                                  sId: app.sId,
                                  appId: app.sId,
                                  appWorkspaceId: owner.sId,
                                  name: app.name,
                                  description: app.description,
                                  type: "dust_app_run_configuration",
                                });
                              }
                            }}
                            disabled={
                              !app.description || app.description.length === 0
                            }
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
                          });
                        }
                      }}
                    />
                    {idx !== arr.length - 1 && <Separator />}
                  </div>
                ))}
              </RadioGroup>
            );
          }}
        />
      )}
    </div>
  );
}
