import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Input, Modal, Page } from "../index_with_tw_base";

const meta = {
  title: "Molecule/Modal",
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
  const [isRightSideUltraWideModalOpen, setIsRightSideUltraWideModalOpen] =
    useState(false);
  return (
    <Page.Layout gap="md">
      <Modal
        isOpen={isOpenNoActionNoChange}
        onClose={() => setIsOpenNoActionNoChange(false)}
        hasChanged={false}
        title="Modal title"
        type="default"
      >
        <div className="s-mt-4 s-h-72">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isRightSideModalOpen}
        onClose={() => setIsRightSideModalOpen(false)}
        type="right-side"
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
              onChange={setInputValue}
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
        type="default"
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOpen}
        onClose={() => setIsFullScreenModalOpen(false)}
        hasChanged={true}
        type="full-screen"
        title="Modal title"
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOverflowOpen}
        onClose={() => setIsFullScreenModalOverflowOpen(false)}
        hasChanged={true}
        type="full-screen"
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
        type="right-side"
        title="Modal title"
        width="wide"
      >
        <div className="s-mt-4 s-h-72 s-text-left">
          I'm the modal content, and I am wide
        </div>
      </Modal>
      <Modal
        isOpen={isRightSideUltraWideModalOpen}
        onClose={() => setIsRightSideUltraWideModalOpen(false)}
        hasChanged={false}
        type="right-side"
        title="Modal title"
        width="ultra-wide"
      >
        <div className="s-mt-4 s-h-72 s-text-left">
          I'm the modal content, and I am ultra-wide
        </div>
      </Modal>
      <Button
        label="Modal without action and without changes"
        onClick={() => setIsOpenNoActionNoChange(true)}
      />
      <Button
        label="Modal with action and changes"
        onClick={() => setIsOpenWithActionAndChange(true)}
      />
      <Button
        label="Modal full screen"
        onClick={() => setIsFullScreenModalOpen(true)}
      />
      <Button
        label="Modal full screen with overflowing content"
        onClick={() => setIsFullScreenModalOverflowOpen(true)}
      />
      <Button
        label="Modal right side"
        onClick={() => setIsRightSideModalOpen(true)}
      />
      <Button
        label="Modal right side wide"
        onClick={() => setIsRightSideWideModalOpen(true)}
      />
      <Button
        label="Modal right side ultra-wide"
        onClick={() => setIsRightSideUltraWideModalOpen(true)}
      />
    </Page.Layout>
  );
};
