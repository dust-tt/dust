import { CommandLineIcon, Item, Modal, Page } from "@dust-tt/sparkle";
import type { AppType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";

export default function AssistantBuilderDustAppModal({
  isOpen,
  setOpen,
  dustApps,
  onSave,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  dustApps: AppType[];
  onSave: (app: AppType) => void;
}) {
  const onClose = () => {
    setOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={false}
      variant="full-screen"
      title="Select Dust App"
    >
      <div className="w-full pt-12">
        <PickDustApp
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

function PickDustApp({
  dustApps,
  show,
  onPick,
}: {
  dustApps: AppType[];
  show: boolean;
  onPick: (app: AppType) => void;
}) {
  const hasSomeUnselectableApps = dustApps.some(
    (app) => !app.description || app.description.length === 0
  );
  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <Page>
        <Page.Header title="Select Dust App" icon={CommandLineIcon} />
        {hasSomeUnselectableApps && (
          <Page.P>
            Dust apps without a description are not selectable. To make a Dust
            App selectable, edit it and add a description.
          </Page.P>
        )}
        {dustApps.map((app) => (
          <Item.Navigation
            label={app.name}
            icon={CommandLineIcon}
            disabled={!app.description || app.description.length === 0}
            key={app.sId}
            onClick={() => {
              onPick(app);
            }}
          />
        ))}
      </Page>
    </Transition>
  );
}
