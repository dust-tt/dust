import type { Meta } from "@storybook/react";
import React from "react";

import { InteractiveImage } from "@sparkle/components/InteractiveImage";

import { Citation } from "../index_with_tw_base";

const meta = {
  title: "Components/Citation",
  component: Citation,
} satisfies Meta<typeof Citation>;

export default meta;

export const InteractiveImageExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    Example of interactive image
    <h2>Loading</h2>
    <InteractiveImage
      alt="Example of a loading interactive image"
      isLoading={true}
      title="Example of a loading interactive image"
    />
    <h2>Loaded</h2>
    <InteractiveImage
      alt="Example of an interactive image"
      src="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
      title="Example of an interactive image"
    />
    <h3>With 4:3 aspect ratio</h3>
    <InteractiveImage
      alt="Example of a 4:3 aspect ratio interactive image"
      src="https://upload.wikimedia.org/wikipedia/commons/d/de/Aspect-ratio-4x3.svg"
      title="Example of a 4:3 aspect ratio interactive image"
    />
  </div>
);
