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
    <div className="s-w-[300px]">
      <h2>Interactive Image Grid with small width</h2>
      <InteractiveImageGrid images={images} />
    </div>
    <div className="s-w-[700px]">
      <h2>Interactive Image Grid with 1 image</h2>
      <InteractiveImageGrid images={images.slice(1, 2)} />
    </div>
    <div className="s-w-[700px]">
      <h2>Interactive Image Grid with 1 image (loading)</h2>
      <InteractiveImageGrid images={images.slice(0, 1)} />
    </div>
  </div>
);

export const InteractiveImageWithRemove = () => {
  const [removed, setRemoved] = React.useState(false);

  return (
    <div className="s-flex s-flex-col s-gap-8">
      <div>
        <h2 className="s-mb-2">
          With onClose callback (hover to see X button, no download button)
        </h2>
        {removed ? (
          <div className="s-flex s-h-24 s-w-24 s-items-center s-justify-center s-rounded-2xl s-bg-muted s-text-muted-foreground">
            Removed!
            <button
              className="s-ml-2 s-text-primary-600 s-underline"
              onClick={() => setRemoved(false)}
            >
              Reset
            </button>
          </div>
        ) : (
          <InteractiveImageGrid
            images={images.slice(1, 2)}
            onClose={() => setRemoved(true)}
          />
        )}
      </div>
      <div>
        <h2 className="s-mb-2">Without onClose (hover to see download button, no X button)</h2>
        <InteractiveImageGrid images={images.slice(1, 2)} />
      </div>
    </div>
  );
};
