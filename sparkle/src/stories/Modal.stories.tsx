import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Modal } from "../index_with_tw_base";

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

  return (
    <>
      <Modal
        isOpen={isOpenNoActionNoChange}
        onClose={() => setIsOpenNoActionNoChange(false)}
        hasChanged={false}
        title="Modal title"
      >
        <div className="s-mt-4 s-h-72">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isOpenWithActionAndChange}
        onClose={() => setIsOpenWithActionAndChange(false)}
        hasChanged={true}
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOpen}
        onClose={() => setIsFullScreenModalOpen(false)}
        hasChanged={true}
        isFullScreen={true}
        title="Modal title"
      >
        <div className="s-mt-4 s-h-72 s-text-left">I'm the modal content</div>
      </Modal>
      <Modal
        isOpen={isFullScreenModalOverflowOpen}
        onClose={() => setIsFullScreenModalOverflowOpen(false)}
        hasChanged={true}
        isFullScreen={true}
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
    </>
  );
};
