import type { Meta, StoryObj } from "@storybook/react";
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
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A 16 / 9 media box: the container reserves the widescreen footprint before
 * the image loads (preventing layout shift), and the image fills and crops
 * to it via `object-cover` + `overflow-hidden`.
 * @summary Widescreen 16:9 media container.
 */
export const Widescreen16x9: Story = {
  args: {
    ratio: 16 / 9,
  },
  render: (args) => (
    <div className="w-96">
      <AspectRatio {...args} className="overflow-hidden rounded-lg bg-muted">
        <img
          src="https://dust.tt/static/droidavatar/Droid_Lime_2.jpg"
          alt="Droid avatar cropped to a 16:9 frame"
          className="h-full w-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
};

/**
 * The same media box at the classic 4 / 3 ratio, used for squarer previews
 * and thumbnails.
 * @summary Standard 4:3 media container.
 */
export const Standard4x3: Story = {
  args: {
    ratio: 4 / 3,
  },
  render: (args) => (
    <div className="w-96">
      <AspectRatio {...args} className="overflow-hidden rounded-lg bg-muted">
        <img
          src="https://dust.tt/static/droidavatar/Droid_Lime_2.jpg"
          alt="Droid avatar cropped to a 4:3 frame"
          className="h-full w-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
};
