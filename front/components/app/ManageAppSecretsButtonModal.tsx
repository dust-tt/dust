import { BracesIcon, Button, Modal, Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { DustAppSecrets } from "@app/pages/w/[wId]/a";

export const ManageAppSecretsButtonModal = ({
  owner,
}: {
  owner: WorkspaceType;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Dev secrets"
        variant="primary"
        icon={BracesIcon}
        size="sm"
        onClick={() => {
          setIsOpen(true);
        }}
      />
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
    </>
  );
};
