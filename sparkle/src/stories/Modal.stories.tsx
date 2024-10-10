import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Input, Modal, Page } from "../index_with_tw_base";

const meta = {
  title: "Modules/Modal",
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;

export const ModalExample = () => {
  const [isOpenNoActionNoChange, setIsOpenNoActionNoChange] = useState(false);
  const [isOpenWithActionAndChange, setIsOpenWithActionAndChange] =
    useState(false);
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = useState(false);
  const [isFullScreenModalOverflowOpen, setIsFullScreenModalOverflowOpen] =
    useState(false);
  const [isRightSideModalOpen, setIsRightSideModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState("initial value");
  const [isRightSideWideModalOpen, setIsRightSideWideModalOpen] =
    useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  return (
    <Page.Layout gap="md">
      <Modal
        isOpen={isOpenNoActionNoChange}
        onClose={() => setIsOpenNoActionNoChange(false)}
        hasChanged={false}
        title="Modal title"
        variant="dialogue"
      >
        <div className="s-mt-4 s-h-72">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isRightSideModalOpen}
        onClose={() => setIsRightSideModalOpen(false)}
        variant="side-sm"
        title="Modal title"
        hasChanged={inputValue !== "initial value"}
      >
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-mt-4 s-flex-none s-text-left">
            I'm the modal content
          </div>
          <div className="s-w-64">
            <Input
              placeholder="Input placeholder"
              className="s-mt-4"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              name="input-name"
            />
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={isOpenWithActionAndChange}
        onClose={() => setIsOpenWithActionAndChange(false)}
        action={{
          labelVisible: true,
          label: "An action",
          variant: "tertiary",
          size: "xs",
        }}
        saveLabel="Save (custom name possible)"
        hasChanged={true}
        variant="dialogue"
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOpen}
        onClose={() => setIsFullScreenModalOpen(false)}
        hasChanged={true}
        variant="full-screen"
        title="Modal title"
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOverflowOpen}
        onClose={() => setIsFullScreenModalOverflowOpen(false)}
        hasChanged={true}
        variant="full-screen"
        title="Modal title"
      >
        <div className="s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
      </Modal>
      <Modal
        isOpen={isRightSideWideModalOpen}
        onClose={() => setIsRightSideWideModalOpen(false)}
        hasChanged={false}
        variant="side-md"
        title="Modal title"
      >
        <div className="s-mt-4 s-h-72 s-text-left">
          I'm the modal content, and I am wide
        </div>
        <div className="s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
        <div className="bg-red s-mt-4 s-h-96 s-bg-red-300 s-text-left">
          I'm the modal content
        </div>
      </Modal>
      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => {}}
        onSave={() => {}}
        isSaving={false}
        hasChanged={false}
        variant="side-sm"
        title="Alert modal"
        alertModal
        action={undefined}
      >
        This is an alert modal.
        <Button label="Ok" onClick={() => setIsAlertModalOpen(false)} />
      </Modal>
      <div className="s-flex s-flex-col s-items-start s-gap-3">
        <div className="s-text-lg s-font-bold">Fullscreen</div>
        <Button
          label="Modal full screen"
          onClick={() => setIsFullScreenModalOpen(true)}
        />
        <Button
          label="Modal full screen with overflowing content"
          onClick={() => setIsFullScreenModalOverflowOpen(true)}
        />
        <div className="s-text-lg s-font-bold">Side modal</div>
        <Button
          label="Modal right side"
          onClick={() => setIsRightSideModalOpen(true)}
        />
        <Button
          label="Modal right side wide"
          onClick={() => setIsRightSideWideModalOpen(true)}
        />
        <Button label="Alert modal" onClick={() => setIsAlertModalOpen(true)} />
      </div>
    </Page.Layout>
  );
};
