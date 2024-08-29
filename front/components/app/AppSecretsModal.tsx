import { Modal, Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

import { DustAppSecrets } from "@app/pages/w/[wId]/a";

export const AppSecretsModal = ({
  owner,
  isOpen,
  setIsOpen,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      hasChanged={false} // There's no current state to save/cancel on this modal.
      title="Secrets"
      variant="side-md"
    >
      <Page variant="modal">
        <Page.Vertical sizing="grow">
          <DustAppSecrets owner={owner} />
        </Page.Vertical>
      </Page>
    </Modal>
  );
};
