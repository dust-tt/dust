import {
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
import React, { useContext, useMemo } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";
import { useSpaces } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { assertNever, slugify } from "@app/types";

export function isActionDustAppRunValid(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "DUST_APP_RUN" && !!action.configuration.app
    ? null
    : "Please select a Dust App.";
}

interface ActionDustAppRunProps {
  action: AssistantBuilderActionConfiguration;
  allowedSpaces: SpaceType[];
  owner: LightWorkspaceType;
  setEdited: (edited: boolean) => void;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
}

export function ActionDustAppRun({
  action,
  allowedSpaces,
  owner,
  setEdited,
  updateAction,
}: ActionDustAppRunProps) {
  const { dustApps } = useContext(AssistantBuilderContext);

  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) =>
        dustApps.some((app) => app.space.sId === space.sId)
      ),
    [spaces, dustApps]
  );
  const hasSomeUnselectableApps = dustApps.some(
    (app) => !app.description || app.description.length === 0
  );

  const noDustApp = dustApps.length === 0;

  const hasNoDustAppsInAllowedSpaces = useMemo(() => {
    // No n^2 complexity.
    const allowedSet = new Set(allowedSpaces.map((space) => space.sId));
    return dustApps.every((app) => !allowedSet.has(app.space.sId));
  }, [dustApps, allowedSpaces]);

  if (!action.configuration) {
    return null;
  }

  return (
    <>
      {noDustApp ? (
        <ContentMessage
          title="You don't have any Dust Application available"
          icon={InformationCircleIcon}
          variant="warning"
        >
          <div className="flex flex-col gap-y-3">
            {(() => {
              switch (owner.role) {
                case "admin":
                case "builder":
                  return (
                    <div>
                      <strong>
                        Visit the "Developer Tools" section in the Build panel
                        to build your first Dust Application.
                      </strong>
                    </div>
                  );
                case "user":
                  return (
                    <div>
                      <strong>
                        Only Admins and Builders can build Dust Applications.
                      </strong>
                    </div>
                  );
                case "none":
                  return <></>;
                default:
                  assertNever(owner.role);
              }
            })()}
          </div>
        </ContentMessage>
      ) : (
        <>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            The agent will execute a{" "}
            <a
              className="font-bold"
              href="https://docs.dust.tt"
              target="_blank"
            >
              Dust Application
            </a>{" "}
            of your design before replying. The output of the app (last block)
            is injected in context for the model to generate an answer. The
            inputs of the app will be automatically generated from the context
            of the conversation based on the descriptions you provided in the
            application's input block dataset schema.
          </div>

          {hasSomeUnselectableApps && (
            <div className="mb-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
              Dust apps without a description are not selectable. To make a Dust
              App selectable, edit it and add a description.
            </div>
          )}
          {isSpacesLoading ? (
            <Spinner />
          ) : (
            <SpaceSelector
              spaces={filteredSpaces}
              allowedSpaces={allowedSpaces}
              defaultSpace={allowedSpaces[0].sId}
              renderChildren={(space) => {
                const appsInSpace = space
                  ? dustApps.filter((app) => app.space.sId === space.sId)
                  : dustApps;
                if (appsInSpace.length === 0 || hasNoDustAppsInAllowedSpaces) {
                  return <>No Dust Apps available.</>;
                }

                return (
                  <RadioGroup
                    defaultValue={
                      action.type === "DUST_APP_RUN"
                        ? action.configuration.app?.sId
                        : undefined
                    }
                  >
                    {sortBy(
                      appsInSpace,
                      (a) => !a.description || a.description.length === 0,
                      "name"
                    ).map((app) => {
                      const disabled =
                        !app.description || app.description.length === 0;
                      return (
                        <React.Fragment key={app.sId}>
                          <RadioGroupCustomItem
                            value={app.sId}
                            id={app.sId}
                            disabled={disabled}
                            iconPosition="start"
                            customItem={
                              <div className="flex items-center gap-1 pl-2">
                                <Icon
                                  visual={CommandLineIcon}
                                  size="md"
                                  className={classNames(
                                    "inline-block flex-shrink-0 align-middle",
                                    disabled
                                      ? "text-muted-foreground dark:text-muted-foreground-night"
                                      : ""
                                  )}
                                />
                                <Label
                                  className={classNames(
                                    "font-bold",
                                    "align-middle",
                                    disabled
                                      ? "text-muted-foreground dark:text-muted-foreground-night"
                                      : "text-foreground dark:text-foreground-night"
                                  )}
                                  htmlFor={app.sId}
                                >
                                  {app.name +
                                    (disabled ? " (No description)" : "")}
                                </Label>
                              </div>
                            }
                            onClick={() => {
                              if (!disabled) {
                                setEdited(true);
                                updateAction({
                                  actionName: slugify(app.name),
                                  actionDescription: app.description ?? "",
                                  getNewActionConfig: (previousAction) => ({
                                    ...previousAction,
                                    app,
                                  }),
                                });
                              }
                            }}
                          >
                            {app.description && (
                              <div className="ml-10 mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                                {app.description}
                              </div>
                            )}
                          </RadioGroupCustomItem>
                          <Separator />
                        </React.Fragment>
                      );
                    })}
                  </RadioGroup>
                );
              }}
            />
          )}
        </>
      )}
    </>
  );
}
