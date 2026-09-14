import type { Meta } from "@storybook/react";
import React from "react";

import { InteractiveImageGrid } from "@sparkle/components/InteractiveImageGrid";

const meta = {
  title: "Product/Conversation/InteractiveImageGrid",
  component: InteractiveImageGrid,
  parameters: {
    docs: {
      description: {
        component: `A responsive grid that arranges one or many conversation images into an adaptive layout. Takes an \`images\` array (each with \`imageUrl\`, \`alt\`, \`title\`, optional \`downloadUrl\`, and an \`isLoading\` flag) and adjusts its columns to the container width and image count. Passing \`onClose\` makes images removable (showing an X on hover) instead of downloadable.

**When to use**
- To display a set of agent-generated or attached images together, including mixed loading and loaded states.

**Guidelines**
- Provide \`alt\` and \`title\` for every image; set \`isLoading\` for placeholders still being generated.
- Choose between a download affordance (default, via \`downloadUrl\`) and a remove affordance (\`onClose\`) — they are mutually exclusive per the hover button shown.
- For a single image with finer control over title position and zoom, use **ImagePreview** directly.`,
      },
    },
  },
} satisfies Meta<typeof InteractiveImageGrid>;

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

/**
 * Several images arranged into the adaptive grid; the column layout adjusts
 * to the container width and image count.
 *
 * @summary Multi-image adaptive grid.
 */
export const MultipleImages = () => (
  <div className="w-[700px]">
    <InteractiveImageGrid images={images} />
  </div>
);

/**
 * The same image set in a narrow container — the grid reflows its columns
 * to fit.
 *
 * @summary Grid reflow in a narrow container.
 */
export const NarrowContainer = () => (
  <div className="w-[300px]">
    <InteractiveImageGrid images={images} />
  </div>
);

/**
 * A single loaded image; hovering reveals the download affordance when a
 * `downloadUrl` is provided.
 *
 * @summary Single image with download on hover.
 */
export const SingleImage = () => (
  <div className="w-[700px]">
    <InteractiveImageGrid images={images.slice(1, 2)} />
  </div>
);

/**
 * An image still being generated: set `isLoading` on the entry to render a
 * placeholder tile.
 *
 * @summary Loading placeholder for a pending image.
 */
export const LoadingImage = () => (
  <div className="w-[700px]">
    <InteractiveImageGrid images={images.slice(0, 1)} />
  </div>
);

/**
 * Passing `onClose` swaps the hover affordance from download to remove
 * (an X button). The removed/reset state here is story scaffolding so the
 * interaction can be replayed.
 *
 * @summary Removable image via the onClose callback.
 */
export const RemovableImage = () => {
  const [removed, setRemoved] = React.useState(false);

  return removed ? (
    <div className="flex h-24 items-center justify-center gap-2 rounded-2xl bg-muted px-4 text-muted-foreground">
      Removed
      <button
        className="text-primary-600 underline"
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
  );
};
