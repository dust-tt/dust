import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  IMAGE_PREVIEW_TITLE_POSITIONS,
  IMAGE_PREVIEW_VARIANTS,
} from "@sparkle/components/ImagePreview";

import { ImagePreview } from "../index_with_tw_base";

const SAMPLE_IMAGE = "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg";

const meta = {
  title: "Product/Conversation/ImagePreview",
  component: ImagePreview,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Displays a single image from a conversation with hover affordances. Supports a **variant** (\`standalone\` / \`embedded\`), a hover \`title\` whose **titlePosition** can be \`bottom\`, \`center\`, or \`hidden\` (dim only, for small thumbnails), an \`isLoading\` skeleton state, an optional \`onClose\` (remove) or \`downloadUrl\` (download) button, and \`manageZoomDialog\` to open a zoom view on click.

**When to use**
- To render an image attachment or an agent-generated image inline in a message.

**Guidelines**
- Always set \`alt\` for accessibility and a \`title\` for the hover label.
- Provide \`downloadUrl\` for saving and \`onClose\` for removal; they render mutually distinct hover buttons.
- For multiple images, use **InteractiveImageGrid**, which composes this component into a responsive layout.`,
      },
    },
  },
  argTypes: {
    variant: {
      description: "Layout variant of the image preview",
      options: IMAGE_PREVIEW_VARIANTS,
      control: { type: "select" },
    },
    titlePosition: {
      description: "Position of the title overlay on hover",
      options: IMAGE_PREVIEW_TITLE_POSITIONS,
      control: { type: "select" },
    },
    isLoading: {
      description: "Whether the image is in a loading state",
      control: "boolean",
    },
    manageZoomDialog: {
      description: "Whether clicking opens a zoom dialog",
      control: "boolean",
    },
    title: {
      description: "Title displayed on hover",
      control: "text",
    },
    alt: {
      description: "Alt text for the image",
      control: "text",
    },
  },
  render: (args) => {
    if (args.variant === "embedded") {
      return (
        <div className="relative h-48 w-48">
          <ImagePreview {...args} />
        </div>
      );
    }
    return (
      <div className="w-48">
        <ImagePreview {...args} />
      </div>
    );
  },
} satisfies Meta<typeof ImagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The baseline preview: an image with an alt text and a hover title along the
 * bottom edge. This is the minimal setup for an image attachment in a message.
 * @summary Standalone preview with bottom hover title.
 */
export const Default: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample image",
    alt: "A sample droid avatar",
    variant: "standalone",
    titlePosition: "bottom",
  },
};

/**
 * The hover title centered over the image instead of anchored to the bottom
 * edge. Use when the bottom of the image carries meaningful content.
 * @summary Hover title centered on the image.
 */
export const TitleCentered: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample image",
    alt: "A sample droid avatar",
    variant: "standalone",
    titlePosition: "center",
  },
};

/**
 * No hover title: the overlay only dims the image. Use for thumbnails too small
 * to show a legible label, where a tooltip carries the name instead.
 * @summary Hover overlay without a title.
 */
export const TitleHidden: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample image",
    alt: "A sample droid avatar",
    variant: "standalone",
    titlePosition: "hidden",
  },
};

/**
 * Passing onClose renders a remove button on hover, for previews the user can
 * dismiss — e.g. an attachment in a message being composed.
 * @summary Remove button via onClose.
 */
export const Dismissable: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample image",
    alt: "A sample droid avatar",
    variant: "standalone",
    onClose: fn(),
  },
};

/**
 * Passing downloadUrl renders a download button on hover, letting the user
 * save the image — typical for agent-generated images.
 * @summary Download button via downloadUrl.
 */
export const Downloadable: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample image",
    alt: "A sample droid avatar",
    variant: "standalone",
    downloadUrl: SAMPLE_IMAGE,
  },
};
