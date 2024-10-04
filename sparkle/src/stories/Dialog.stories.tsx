import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Dialog } from "../index_with_tw_base";

const meta = {
  title: "Modules/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;

export const DialogExample = () => {
  const [isOpen1, setisOpen1] = useState(false);
  const [isOpen2, setisOpen2] = useState(false);
  const [isOpen3, setisOpen3] = useState(false);
  const [isOpen4, setisOpen4] = useState(false);
  const [isOpen5, setisOpen5] = useState(false);

  return (
    <div className="items-start s-flex s-flex-col s-gap-10">
      <div>
        <Dialog
          isOpen={isOpen1}
          title="Dialog title"
          cancelLabel="Cancel"
          onValidate={() => setisOpen1(false)}
          onCancel={() => setisOpen1(false)}
          validateVariant="primary"
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button
          label="Dialog with primary validate"
          onClick={() => setisOpen1(true)}
        />
      </div>
      <div>
        <Dialog
          isOpen={isOpen2}
          title="Dialog title"
          cancelLabel="Cancel"
          onValidate={() => setisOpen2(false)}
          onCancel={() => setisOpen2(false)}
          validateVariant="primaryWarning"
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button
          label="Dialog with warning validate"
          onClick={() => setisOpen2(true)}
        />
      </div>
      <div>
        <Dialog
          isOpen={isOpen3}
          title="Dialog title"
          cancelLabel="Cancel"
          onValidate={() => setisOpen3(false)}
          onCancel={() => setisOpen3(false)}
          backgroundType="snow"
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button
          label="Dialog with BACKGROUND"
          onClick={() => setisOpen3(true)}
        />
      </div>
      <div>
        <Dialog
          disabled
          isOpen={isOpen4}
          title="Dialog title"
          cancelLabel="Cancel"
          onValidate={() => setisOpen4(false)}
          onCancel={() => setisOpen4(false)}
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button label="Dialog with disabled" onClick={() => setisOpen4(true)} />
      </div>
      <div>
        <Dialog
          alertDialog={true}
          isOpen={isOpen5}
          title="Alert Dialog title"
          onValidate={() => setisOpen5(false)}
        >
          <div>I'm the modal content</div>
        </Dialog>
        <Button label="Alert dialog" onClick={() => setisOpen5(true)} />
      </div>
    </div>
  );
};
