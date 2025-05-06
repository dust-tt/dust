import type { Meta } from "@storybook/react";
import React from "react";

import { InteractiveImageGrid } from "@sparkle/components/InteractiveImageGrid";

import { Citation } from "../index_with_tw_base";

const meta = {
  title: "Components/Citation",
  component: Citation,
} satisfies Meta<typeof Citation>;

export default meta;

const images = [
  {
    alt: "Example of a loading interactive image",
    isLoading: true,
    title: "Example of a loading interactive image",
  },
  {
    alt: "Example of an interactive image",
    downloadUrl: "https://dust.tt/static/droidavatar/Droid_Lime_2.jpg",
    imageUrl: "https://dust.tt/static/droidavatar/Droid_Lime_2.jpg",
    title: "Example of an interactive image",
  },
  {
    alt: "Example of an interactive image",
    downloadUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
    imageUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
    title: "Example of an interactive image",
  },
  {
    alt: "Example of an interactive image",
    downloadUrl: "https://dust.tt/static/droidavatar/Droid_Lime_4.jpg",
    imageUrl: "https://dust.tt/static/droidavatar/Droid_Lime_4.jpg",
    title: "Example of an interactive image",
  },
  {
    alt: "Example of an interactive image",
    downloadUrl: "https://dust.tt/static/droidavatar/Droid_Lime_5.jpg",
    imageUrl: "https://dust.tt/static/droidavatar/Droid_Lime_5.jpg",
    title: "Example of an interactive image",
  },
  {
    alt: "Example of an interactive image",
    downloadUrl: "https://dust.tt/static/droidavatar/Droid_Lime_6.jpg",
    imageUrl: "https://dust.tt/static/droidavatar/Droid_Lime_6.jpg",
    title: "Example of an interactive image",
  },
  {
    alt: "Example of an interactive PNG image",
    downloadUrl: "https://dust.tt/static/DustHorizontalIcon.png",
    imageUrl: "https://dust.tt/static/DustHorizontalIcon.png",
    title: "Example of an interactive image",
  },
];

export const InteractiveImageExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-w-[700px]">
      <h2>Interactive Image Grid</h2>
      <InteractiveImageGrid images={images} />
    </div>
  </div>
);
