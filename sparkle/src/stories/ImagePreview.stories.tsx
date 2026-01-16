import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  IMAGE_PREVIEW_TITLE_POSITIONS,
  IMAGE_PREVIEW_VARIANTS,
} from "@sparkle/components/ImagePreview";

import { ImagePreview, Separator } from "../index_with_tw_base";

const SAMPLE_IMAGE = "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg";

const meta = {
  title: "Components/ImagePreview",
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
    if (args.variant === "absolute") {
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
    variant: "square",
    titlePosition: "bottom",
    isLoading: false,
    manageZoomDialog: true,
  },
};

export const WithClose: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Closeable Image",
    variant: "square",
    titlePosition: "bottom",
  },
  render: (args) => (
    <div className="s-w-48">
      <ImagePreview {...args} onClose={() => alert("Close clicked")} />
    </div>
  ),
};

export const WithDownload: Story = {
  args: {
    imgSrc: SAMPLE_IMAGE,
    title: "Downloadable Image",
    downloadUrl: SAMPLE_IMAGE,
    variant: "square",
    titlePosition: "bottom",
  },
  render: (args) => (
    <div className="s-w-48">
      <ImagePreview {...args} />
    </div>
  ),
};

const ImagePreviewByVariant = ({
  variant,
}: {
  variant: React.ComponentProps<typeof ImagePreview>["variant"];
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">
      {variant?.toUpperCase()}
    </h3>
    <div className="s-flex s-flex-col s-gap-4">
      {IMAGE_PREVIEW_TITLE_POSITIONS.map((titlePosition) => (
        <div key={titlePosition} className="s-flex s-flex-col s-gap-2">
          <div className="s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
            titlePosition: {titlePosition}
          </div>
          <div className="s-flex s-items-center s-gap-4">
            {variant === "absolute" ? (
              <>
                <div className="s-relative s-h-32 s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="Normal"
                    variant={variant}
                    titlePosition={titlePosition}
                  />
                </div>
                <div className="s-relative s-h-32 s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="Loading"
                    variant={variant}
                    titlePosition={titlePosition}
                    isLoading
                  />
                </div>
                <div className="s-relative s-h-32 s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="With Close"
                    variant={variant}
                    titlePosition={titlePosition}
                    onClose={() => {}}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="Normal"
                    variant={variant}
                    titlePosition={titlePosition}
                  />
                </div>
                <div className="s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="Loading"
                    variant={variant}
                    titlePosition={titlePosition}
                    isLoading
                  />
                </div>
                <div className="s-w-32">
                  <ImagePreview
                    imgSrc={SAMPLE_IMAGE}
                    title="With Close"
                    variant={variant}
                    titlePosition={titlePosition}
                    onClose={() => {}}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  </>
);

export const Gallery: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <ImagePreviewByVariant variant="square" />
      <ImagePreviewByVariant variant="absolute" />
    </div>
  ),
};
