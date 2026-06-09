import type { Meta } from "@storybook/react";
import React from "react";

import { DropzoneOverlay } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/DropzoneOverlay",
  component: DropzoneOverlay,
  parameters: {
    docs: {
      description: {
        component: `A full-surface visual overlay that signals a drop target during a drag-and-drop file upload. Toggle visibility with **isDragActive**, and label the affordance with **title** and **description**.

**When to use**
- To give clear visual feedback when a user drags files over a region that accepts uploads.

**Guidelines**
- Drive **isDragActive** from your dropzone's own drag state; the overlay only renders the cue, it does not handle the drop itself.
- Keep the **title** short and the **description** action-oriented (e.g. \`"Drag and drop your files here"\`).`,
      },
    },
  },
} satisfies Meta<typeof DropzoneOverlay>;

export default meta;

export const DropzoneOverlayExample = () => {
  const [isDragActive, setIsDragActive] = React.useState(false);

  return (
    <div
      className="s-flex s-min-h-full s-flex-col s-gap-4"
      onMouseEnter={() => {
        setIsDragActive(true);
      }}
      onMouseLeave={() => {
        setIsDragActive(false);
      }}
    >
      <DropzoneOverlay
        isDragActive={isDragActive}
        description={"Drag and drop your files here"}
        title={"Drag and drop"}
      />
      <div className="s-flex s-min-h-96 s-items-center s-justify-center">
        This is some placeholder content.
      </div>
    </div>
  );
};
