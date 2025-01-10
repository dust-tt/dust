import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, ElementDialog, Page } from "../index_with_tw_base";

const meta = {
  title: "Modules/ElementDialog",
  component: ElementDialog,
} satisfies Meta<typeof ElementDialog>;

export default meta;

export const ElementDialogExample = () => {
  const [element, setElement] = useState<{ text: string } | null>(null);
  return (
    <Page.Layout gap="md">
      <ElementDialog
        openOnElement={element}
        closeDialogFn={() => setElement(null)}
        onCancel={(closeDialogFn) => {
          console.log("canceled!");
          closeDialogFn();
        }}
        cancelLabel="Cancel"
        title="Element Modal title"
        onValidate={(closeDialogFn) => {
          console.log("validated!");
          closeDialogFn();
        }}
      >
        <div className="s-flex s-flex-col s-gap-3">
          <div className="s-mt-4 s-flex-none s-text-left">
            I'm the dialog content
          </div>
          <div className="s-w-64">
            The text is: <span className="font-bold">{element?.text}</span>
          </div>
        </div>
      </ElementDialog>
      <div className="s-flex s-flex-col s-items-start s-gap-3">
        <div className="s-text-lg s-font-bold">Fullscreen</div>
        <Button
          onClick={() => setElement({ text: "Element 1" })}
          label="Element 1"
        />
        <Button
          onClick={() => setElement({ text: "Element 2" })}
          label="Element 2"
        />
        <Button
          onClick={() => setElement({ text: "Element 3" })}
          label="Element 3"
        />
      </div>
    </Page.Layout>
  );
};
