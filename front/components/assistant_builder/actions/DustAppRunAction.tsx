import { ContentMessage } from "@dust-tt/sparkle";
import type { AppType, WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderDustAppModal from "@app/components/assistant_builder/AssistantBuilderDustAppModal";
import DustAppSelectionSection from "@app/components/assistant_builder/DustAppSelectionSection";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";

export function isActionDustAppRunValid(builderState: AssistantBuilderState) {
  return !!builderState.dustAppConfiguration.app;
}

export function ActionDustAppRun({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  dustApps,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  dustApps: AppType[];
}) {
  const [showDustAppsModal, setShowDustAppsModal] = useState(false);

  const deleteDustApp = () => {
    setEdited(true);
    setBuilderState((state) => {
      return { ...state, dustAppConfiguration: { app: null } };
    });
  };

  const noDustApp = dustApps.length === 0;

  return (
    <>
      <AssistantBuilderDustAppModal
        isOpen={showDustAppsModal}
        setOpen={(isOpen) => {
          setShowDustAppsModal(isOpen);
        }}
        dustApps={dustApps}
        onSave={({ app }) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            dustAppConfiguration: {
              app,
            },
          }));
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
            show={builderState.actionMode === "DUST_APP_RUN"}
            dustAppConfiguration={builderState.dustAppConfiguration}
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
