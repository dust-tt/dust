import {
  CommandLineIcon,
  ContextItem,
  Icon,
  Modal,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { AppType, LightWorkspaceType, SpaceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { sortBy } from "lodash";
import { useMemo } from "react";

import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import { useSpaces } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";

interface AssistantBuilderDustAppModalProps {
  allowedSpaces: SpaceType[];
  dustApps: AppType[];
  isOpen: boolean;
  onSave: (app: AppType) => void;
  owner: LightWorkspaceType;
  setOpen: (isOpen: boolean) => void;
}

export default function AssistantBuilderDustAppModal({
  allowedSpaces,
  dustApps,
  isOpen,
  onSave,
  owner,
  setOpen,
}: AssistantBuilderDustAppModalProps) {
  const onClose = () => {
    setOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={false}
      variant="side-md"
      title="Select Dust App"
    >
      <div className="w-full pt-12">
        <PickDustApp
          allowedSpaces={allowedSpaces}
          owner={owner}
          show={true}
          dustApps={dustApps}
          onPick={(app) => {
            onSave(app);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

interface PickDustAppProps {
  allowedSpaces: SpaceType[];
  dustApps: AppType[];
  onPick: (app: AppType) => void;
  owner: LightWorkspaceType;
  show: boolean;
}

function PickDustApp({
  owner,
  allowedSpaces,
  dustApps,
  show,
  onPick,
}: PickDustAppProps) {
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

  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page variant="modal">
        <Page.Header title="Select Dust App" icon={CommandLineIcon} />
        {hasSomeUnselectableApps && (
          <Page.P>
            Dust apps without a description are not selectable. To make a Dust
            App selectable, edit it and add a description.
          </Page.P>
        )}
        {isSpacesLoading ? (
          <Spinner />
        ) : (
          <SpaceSelector
            spaces={filteredSpaces}
            allowedSpaces={allowedSpaces}
            defaultSpace={allowedSpaces[0].sId}
            renderChildren={(space) => {
              const allowedDustApps = space
                ? dustApps.filter((app) => app.space.sId === space.sId)
                : dustApps;

              if (allowedDustApps.length === 0) {
                return <>No Dust Apps available.</>;
              }

              return (
                <ContextItem.List>
                  {sortBy(
                    allowedDustApps,
                    (a) => !a.description || a.description.length === 0,
                    "name"
                  ).map((app) => {
                    const disabled =
                      !app.description || app.description.length === 0;
                    return (
                      <ContextItem
                        key={app.sId}
                        title={
                          <span
                            className={classNames(
                              disabled
                                ? "s-text-element-500"
                                : "s-text-foreground"
                            )}
                          >
                            {app.name + (disabled ? " (No description)" : "")}
                          </span>
                        }
                        visual={
                          <Icon
                            visual={CommandLineIcon}
                            size="md"
                            className={disabled ? "s-text-element-500" : ""}
                          />
                        }
                        onClick={disabled ? undefined : () => onPick(app)}
                      />
                    );
                  })}
                </ContextItem.List>
              );
            }}
          />
        )}
      </Page>
    </Transition>
  );
}
