import type { Meta } from "@storybook/react";
import React from "react";

import { DropzoneOverlay } from "../index_with_tw_base";

const meta = {
  title: "Primitives/DropzoneOverlay",
  component: DropzoneOverlay,
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
      <DropzoneOverlay isDragActive={isDragActive} />
      <div className="s-flex s-min-h-96 s-items-center s-justify-center">
        This is some placeholder content.
      </div>
    </div>
  );
};
