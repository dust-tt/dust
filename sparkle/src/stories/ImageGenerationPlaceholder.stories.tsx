import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button } from "../index_with_tw_base";
import { ImageGenerationPlaceholder } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/ImageGenerationPlaceholder",
  component: ImageGenerationPlaceholder,
  parameters: {
    docs: {
      description: {
        component: `A square placeholder that shows an animated "generating" state and then smoothly reveals the finished image once it loads. Pass **src** (and **alt**) to transition from the loading shimmer to the image, control the dimensions with **size**, and customize the loading text with **label**.

**When to use**
- While an image is being generated or fetched asynchronously and you want a graceful reveal rather than a layout jump.

**Guidelines**
- Render with no **src** to show the generating state, then set **src** when the asset is ready to trigger the reveal.
- Keep a stable **size** so surrounding layout does not shift when the image appears; for generic indeterminate waits use the **Spinner** instead.`,
      },
    },
  },
} satisfies Meta<typeof ImageGenerationPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMAGE_SRC = "https://picsum.photos/seed/city42/520/520";

/**
 * The animated "generating" state shown while no src is set — an image is
 * still being produced. To stretch the placeholder to its parent instead of a
 * fixed size, set the boolean fill prop (absolutely positioned, inset 0).
 * @summary Animated loading state without src.
 */
export const GeneratingState: Story = {};

/**
 * The settled state once src is provided and the image has loaded: the shimmer
 * fades out and the image is revealed in place, at the same dimensions.
 * @summary Revealed image after loading.
 */
export const RevealedState: Story = {
  args: {
    src: IMAGE_SRC,
    alt: "A futuristic city",
  },
};

/**
 * The label prop replaces the default loading text, to describe what is being
 * generated.
 * @summary Custom loading label.
 */
export const CustomLabel: Story = {
  args: {
    label: "Generating scene",
  },
};

// Stateful scaffolding for the LiveTransition playground: holds the src in
// state and bumps a React key on reset so the placeholder remounts fresh.
function LiveTransitionDemo() {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [key, setKey] = useState(0);

  const reset = () => {
    setSrc(undefined);
    setKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-12">
      <ImageGenerationPlaceholder key={key} src={src} alt="A futuristic city" />
      <div className="flex gap-3">
        <Button
          label="Reveal image"
          size="sm"
          variant="primary"
          disabled={!!src}
          onClick={() => setSrc(IMAGE_SRC)}
        />
        <Button label="Reset" size="sm" variant="outline" onClick={reset} />
      </div>
    </div>
  );
}

/**
 * Interactive playground for the generating-to-revealed transition: press
 * "Reveal image" to set src and watch the reveal animation, "Reset" to remount
 * the placeholder and start over. The buttons are story scaffolding, not part
 * of the component.
 * @summary Interactive reveal/reset playground.
 */
export const LiveTransition: Story = {
  tags: ["!manifest"],
  render: () => <LiveTransitionDemo />,
};

/**
 * Design-review reference: the placeholder at 120, 200, and 260px (the
 * default) side by side, for comparing the animation density across sizes.
 * @summary Size scale reference gallery.
 */
export const Sizes: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-wrap items-end gap-6 p-12">
      <div className="flex flex-col items-center gap-2">
        <ImageGenerationPlaceholder size={120} />
        <span className="text-xs text-muted-foreground">120px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ImageGenerationPlaceholder size={200} />
        <span className="text-xs text-muted-foreground">200px</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ImageGenerationPlaceholder size={260} />
        <span className="text-xs text-muted-foreground">260px (default)</span>
      </div>
    </div>
  ),
};
