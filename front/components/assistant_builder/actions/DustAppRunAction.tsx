import { ContentMessage } from "@dust-tt/sparkle";
import type {
  LightWorkspaceType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, slugify } from "@dust-tt/types";
import { useContext, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderDustAppModal from "@app/components/assistant_builder/AssistantBuilderDustAppModal";
import DustAppSelectionSection from "@app/components/assistant_builder/DustAppSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderDustAppConfiguration,
} from "@app/components/assistant_builder/types";
import {
  ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_DESCRIPTION,
  ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME,
} from "@app/components/assistant_builder/types";

export function isActionDustAppRunValid(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "DUST_APP_RUN" && !!action.configuration.app
    ? null
    : "Please select a Dust App.";
}

interface ActionDustAppRunProps {
  action: AssistantBuilderActionConfiguration;
  allowedVaults: VaultType[];
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
  allowedVaults,
  owner,
  setEdited,
  updateAction,
}: ActionDustAppRunProps) {
  const { dustApps } = useContext(AssistantBuilderContext);
  const [showDustAppsModal, setShowDustAppsModal] = useState(false);

  const deleteDustApp = () => {
    setEdited(true);
    updateAction({
      actionName:
        ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME,
      actionDescription:
        ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_DESCRIPTION,
      getNewActionConfig: (previousAction) => ({
        ...previousAction,
        app: null,
      }),
    });
  };

  const noDustApp = dustApps.length === 0;

  if (!action.configuration) {
    return null;
  }

  return (
    <>
      <AssistantBuilderDustAppModal
        allowedVaults={allowedVaults}
        owner={owner}
        isOpen={showDustAppsModal}
        setOpen={(isOpen) => {
          setShowDustAppsModal(isOpen);
        }}
        dustApps={dustApps}
        onSave={(app) => {
          setEdited(true);
          updateAction({
            actionName: slugify(app.name),
            actionDescription: app.description ?? "",
            getNewActionConfig: (previousAction) => ({
              ...previousAction,
              app,
            }),
          });
        }}
      />

      {noDustApp ? (
        <ContentMessage
          title="You don't have any Dust Application available"
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
          <div className="text-sm text-element-700">
            The assistant will execute a{" "}
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
          <DustAppSelectionSection
            show={true}
            dustAppConfiguration={
              action.configuration as AssistantBuilderDustAppConfiguration
            }
            openDustAppModal={() => {
              setShowDustAppsModal(true);
            }}
            onDelete={deleteDustApp}
            canSelectDustApp={!noDustApp}
          />
        </>
      )}
    </>
  );
}
