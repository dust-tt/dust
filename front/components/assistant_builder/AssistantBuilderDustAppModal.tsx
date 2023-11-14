import {
  CloudArrowDownIcon,
  CommandLineIcon,
  Item,
  Modal,
  PageHeader,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import { AssistantBuilderDustAppConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { AppType } from "@app/types/app";

export default function AssistantBuilderDustAppModal({
  isOpen,
  setOpen,
  dustApps,
  onSave,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  dustApps: AppType[];
  onSave: (params: AssistantBuilderDustAppConfiguration) => void;
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
            onSave({
              app,
            });
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
  return (
    <Transition show={show} className="mx-auto max-w-6xl">
      <div className="flex flex-col">
        <div className="mb-6">
          <PageHeader title="Select Dust App" icon={CloudArrowDownIcon} />
        </div>

        {dustApps.map((app) => (
          <Item
            label={app.name}
            icon={CommandLineIcon}
            key={app.sId}
            size="md"
            onClick={() => {
              onPick(app);
            }}
          />
        ))}
      </div>
    </Transition>
  );
}
