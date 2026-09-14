import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DustLogoSquare } from "@sparkle/logo/dust";

import { Div3D, GithubLogo, Hover3D, Icon } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/Hover3D",
  component: Hover3D,
  parameters: {
    docs: {
      description: {
        component: `A container that tilts in 3D toward the cursor, with nested **Div3D** children that shift along the Z axis by their **depth** to create a parallax, layered effect. Tune the tilt with **perspective** and **depth**, and set **fullscreenSensible** to track the cursor across the whole viewport rather than just the element.

**When to use**
- For showcase or marketing surfaces (logos, feature cards, hero imagery) where playful depth adds delight.

**Guidelines**
- Wrap each layer in a **Div3D** and stagger their **depth** values to control how far each pops forward or recedes.
- Reserve for non-essential decoration; keep it off dense, interactive UI where motion would distract.`,
      },
    },
  },
} satisfies Meta<typeof Hover3D>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The minimal setup: one Hover3D container with a single Div3D child popping
 * forward. Hover the card to see it tilt toward the cursor.
 * @summary Single-layer tilt on hover.
 */
export const BasicTilt: Story = {
  args: {
    className: "rounded-3xl bg-primary-800 p-8",
    children: (
      <Div3D depth={60}>
        <Icon visual={DustLogoSquare} size="2xl" />
      </Div3D>
    ),
  },
};

/**
 * Several Div3D layers with staggered depth values inside one container: the
 * negative depth on Hover3D pushes the card surface back while each layer pops
 * forward by a different amount, producing a parallax effect as the card tilts.
 * @summary Staggered Div3D depths create parallax.
 */
export const LayeredParallax: Story = {
  args: {
    className:
      "rounded-4xl bg-linear-to-r from-cyan-500 to-blue-500 p-10 shadow-xl",
    depth: -30,
    children: (
      <>
        <Div3D depth={60}>
          <Icon visual={DustLogoSquare} size="2xl" />
        </Div3D>
        <Div3D depth={30} className="mt-2 text-lg font-semibold text-white">
          Layered depth
        </Div3D>
        <Div3D depth={10} className="text-sm text-white/80">
          Each layer sits at its own Z offset
        </Div3D>
      </>
    ),
  },
};

/**
 * With fullscreenSensible the tilt follows the cursor across the whole
 * viewport instead of only while hovering the element — useful for hero
 * surfaces that should react before the pointer reaches them. Pair with a
 * larger perspective for a subtler tilt.
 * @summary Viewport-wide cursor tracking.
 */
export const FullscreenSensible: Story = {
  args: {
    className: "rounded-2xl bg-muted-background p-3 shadow-xl",
    depth: -20,
    perspective: 1000,
    fullscreenSensible: true,
    children: (
      <Div3D depth={50}>
        <Icon visual={GithubLogo} size="xl" />
      </Div3D>
    ),
  },
};
