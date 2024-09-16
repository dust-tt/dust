import { CommandLineIcon, Item, Modal, Page } from "@dust-tt/sparkle";
import type { AppType, LightWorkspaceType, VaultType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { sortBy } from "lodash";

import { VaultSelector } from "@app/components/assistant_builder/vaults/VaultSelector";

interface AssistantBuilderDustAppModalProps {
  allowedVaults: VaultType[];
  dustApps: AppType[];
  isOpen: boolean;
  onSave: (app: AppType) => void;
  owner: LightWorkspaceType;
  setOpen: (isOpen: boolean) => void;
}

export default function AssistantBuilderDustAppModal({
  allowedVaults,
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
          allowedVaults={allowedVaults}
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
  allowedVaults: VaultType[];
  dustApps: AppType[];
  onPick: (app: AppType) => void;
  owner: LightWorkspaceType;
  show: boolean;
}

function PickDustApp({
  owner,
  allowedVaults,
  dustApps,
  show,
  onPick,
}: PickDustAppProps) {
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
        <VaultSelector
          owner={owner}
          allowedVaults={allowedVaults}
          defaultVault={allowedVaults[0].sId}
          renderChildren={(vault) => {
            const allowedDustApps = vault
              ? dustApps.filter((app) => app.vault.sId === vault.sId)
              : dustApps;

            if (allowedDustApps.length === 0) {
              return <>No Dust Apps available.</>;
            }

            return (
              <>
                {sortBy(
                  allowedDustApps,
                  (a) => !a.description || a.description.length === 0,
                  "name"
                ).map((app) => {
                  const disabled =
                    !app.description || app.description.length === 0;
                  return (
                    <Item.Navigation
                      label={app.name + (disabled ? " (No description)" : "")}
                      icon={CommandLineIcon}
                      disabled={disabled}
                      key={app.sId}
                      onClick={() => {
                        onPick(app);
                      }}
                    />
                  );
                })}
              </>
            );
          }}
        />
      </Page>
    </Transition>
  );
}
