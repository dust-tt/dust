import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Dialog } from "../index_with_tw_base";

const meta = {
  title: "Molecule/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;

export const DialogExample = () => {
  const [isOpen1, setisOpen1] = useState(false);
  const [isOpen2, setisOpen2] = useState(false);
  return (
    <div className="items-start s-flex s-flex-col s-gap-10">
      <div>
        <Dialog
          isOpen={isOpen1}
          title="Modal title"
          onValidate={() => setisOpen1(false)}
          onCancel={() => setisOpen1(false)}
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button
          label="Modal with primary validate"
          onClick={() => setisOpen1(true)}
        />
      </div>
      <div>
        <Dialog
          isOpen={isOpen2}
          title="Modal title"
          onValidate={() => setisOpen2(false)}
          onCancel={() => setisOpen2(false)}
          validateVariant="primaryWarning"
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button
          label="Modal with warning validate"
          onClick={() => setisOpen2(true)}
        />
      </div>
    </div>
  );
};
