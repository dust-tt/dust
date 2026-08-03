import type { Meta } from "@storybook/react";
import React from "react";

import { AspectRatio } from "../index_with_tw_base";

const meta = {
  title: "Layout/AspectRatio",
  component: AspectRatio,
  parameters: {
    docs: {
      description: {
        component: `Constrains its children to a fixed width-to-height **ratio** (e.g. \`16 / 9\`, \`4 / 3\`), so the box resizes responsively while keeping proportions.

**When to use**
- To reserve consistent space for media (images, video, embeds, previews) and prevent layout shift.

**Guidelines**
- Pass **ratio** as a number division (\`16 / 9\`) rather than a decimal for readability.
- Add \`overflow-hidden\` on the container and let the media fill it so it crops cleanly to the ratio.`,
      },
    },
  },
} satisfies Meta;

export default meta;

export const Demo = () => {
  return (
    <div className="flex flex-col gap-12">
      <Demo169 />
      <Demo43 />
    </div>
  );
};

export const Demo169 = () => {
  return (
    <div className="grid grid-cols-3 gap-4">
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={16 / 9}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
    </div>
  );
};
export const Demo43 = () => {
  return (
    <div className="grid grid-cols-3 gap-4">
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
      <AspectRatio
        ratio={4 / 3}
        className="flex items-center justify-center overflow-hidden bg-muted"
      >
        Hello
      </AspectRatio>
    </div>
  );
};
