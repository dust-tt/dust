import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Dialog } from "../index_with_tw_base";

const meta = {
  title: "Molecule/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;

export const DialogExample = () => {
  const [isOpenNoActionNoChange, setIsOpenNoActionNoChange] = useState(false);
  return (
    <div>
      <Dialog
        isOpen={isOpenNoActionNoChange}
        onClose={() => setIsOpenNoActionNoChange(false)}
        title="Modal title"
        onValidate={() => setIsOpenNoActionNoChange(false)}
        onCancel={() => setIsOpenNoActionNoChange(false)}
      >
        <div>I'm the modal content</div>
      </Dialog>
      <div className="s-flex s-flex-col s-items-start s-gap-3">
        <div className="s-text-lg s-font-bold">Centered</div>
        <Button
          label="Modal without action and without changes"
          onClick={() => setIsOpenNoActionNoChange(true)}
        />
      </div>
    </div>
  );
};
