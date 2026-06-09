import type { Meta } from "@storybook/react";
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

const IMAGE_SRC = "https://picsum.photos/seed/city42/520/520";

export function GeneratingState() {
  return (
    <div className="s-flex s-items-center s-justify-center s-p-12">
      <ImageGenerationPlaceholder />
    </div>
  );
}

export function RevealedState() {
  return (
    <div className="s-flex s-items-center s-justify-center s-p-12">
      <ImageGenerationPlaceholder src={IMAGE_SRC} alt="A futuristic city" />
    </div>
  );
}

export function LiveTransition() {
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [key, setKey] = useState(0);

  const reset = () => {
    setSrc(undefined);
    setKey((k) => k + 1);
  };

  return (
    <div className="s-flex s-flex-col s-items-center s-gap-6 s-p-12">
      <ImageGenerationPlaceholder key={key} src={src} alt="A futuristic city" />
      <div className="s-flex s-gap-3">
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

export function Sizes() {
  return (
    <div className="s-flex s-flex-wrap s-items-end s-gap-6 s-p-12">
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <ImageGenerationPlaceholder size={120} />
        <span className="s-text-xs s-text-muted-foreground">120px</span>
      </div>
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <ImageGenerationPlaceholder size={200} />
        <span className="s-text-xs s-text-muted-foreground">200px</span>
      </div>
      <div className="s-flex s-flex-col s-items-center s-gap-2">
        <ImageGenerationPlaceholder size={260} />
        <span className="s-text-xs s-text-muted-foreground">
          260px (default)
        </span>
      </div>
    </div>
  );
}

export function CustomLabel() {
  return (
    <div className="s-flex s-items-center s-justify-center s-p-12">
      <ImageGenerationPlaceholder label="Generating scene" />
    </div>
  );
}
