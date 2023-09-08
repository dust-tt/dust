import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  Modal,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/Modal",
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;

export const ModalExample = () => {
  const [isOpenNoActionNoChange, setIsOpenNoActionNoChange] = useState(false);
  const [isOpenWithActionAndChange, setIsOpenWithActionAndChange] =
    useState(false);

  return (
    <>
      <Modal
        isOpen={isOpenNoActionNoChange}
        onClose={() => setIsOpenNoActionNoChange(false)}
        hasChanged={false}
      >
        <div className="s-mt-4 s-h-72 " />
      </Modal>
      <Modal
        isOpen={isOpenWithActionAndChange}
        onClose={() => setIsOpenWithActionAndChange(false)}
        hasChanged={true}
        action={{
          icon: ChatBubbleBottomCenterTextIcon,
          label: "Contact an agent",
          labelVisible: true,
          variant: "tertiary",
          size: "xs",
        }}
      >
        <div className="s-mt-4 s-h-72 " />
      </Modal>
      <Button
        label="Modal without action and without changes"
        onClick={() => setIsOpenNoActionNoChange(true)}
      />
      <Button
        label="Modal with action and changes"
        onClick={() => setIsOpenWithActionAndChange(true)}
      />
    </>
  );
};
