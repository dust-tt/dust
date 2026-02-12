import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  IMAGE_PREVIEW_TITLE_POSITIONS,
  IMAGE_PREVIEW_VARIANTS,
} from "@sparkle/components/ImagePreview";

import { ImagePreview } from "../index_with_tw_base";

const SAMPLE_IMAGE = "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg";

const meta = {
  title: "Conversation/ImagePreview",
  component: ImagePreview,
  tags: ["autodocs"],
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
        <div className="s-relative s-h-48 s-w-48">
          <ImagePreview {...args} />
        </div>
      );
    }
    return (
      <div className="s-w-48">
        <ImagePreview {...args} />
      </div>
    );
  },
} satisfies Meta<typeof ImagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleImagePreview: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Sample Image",
    alt: "A sample droid avatar",
    variant: "standalone",
    titlePosition: "bottom",
    isLoading: false,
    manageZoomDialog: true,
  },
};

export const Variants: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    variant: "standalone",
  },
  render: (args) => (
    <div className="s-flex s-flex-col s-gap-6">
      <div className="s-flex s-flex-col s-gap-2">
        <div className="s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
          Title Position: Bottom
        </div>
        <div className="s-flex s-items-center s-gap-4">
          <div className="s-w-32">
            <ImagePreview {...args} title="Normal" titlePosition="bottom" />
          </div>
          <div className="s-w-32">
            <ImagePreview
              {...args}
              title="With Close"
              titlePosition="bottom"
              onClose={() => alert("Close clicked")}
            />
          </div>
          <div className="s-w-32">
            <ImagePreview
              {...args}
              title="With Download"
              titlePosition="bottom"
              downloadUrl={SAMPLE_IMAGE}
            />
          </div>
        </div>
      </div>
      <div className="s-flex s-flex-col s-gap-2">
        <div className="s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
          Title Position: Center
        </div>
        <div className="s-flex s-items-center s-gap-4">
          <div className="s-w-32">
            <ImagePreview {...args} title="Normal" titlePosition="center" />
          </div>
          <div className="s-w-32">
            <ImagePreview
              {...args}
              title="With Close"
              titlePosition="center"
              onClose={() => alert("Close clicked")}
            />
          </div>
          <div className="s-w-32">
            <ImagePreview
              {...args}
              title="With Download"
              titlePosition="center"
              downloadUrl={SAMPLE_IMAGE}
            />
          </div>
        </div>
      </div>
    </div>
  ),
};
