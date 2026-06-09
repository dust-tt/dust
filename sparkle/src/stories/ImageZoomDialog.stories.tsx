import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button, ImageZoomDialog } from "../index_with_tw_base";

const SAMPLE_IMAGE = "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg";

const meta: Meta<typeof ImageZoomDialog> = {
  title: "Overlays/ImageZoomDialog",
  component: ImageZoomDialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A full-screen overlay for viewing an image at a larger size. It is controlled via \`open\` / \`onOpenChange\` and takes an \`image\` object (\`src\`, \`alt\`, \`title\`, optional \`downloadUrl\`, and an \`isLoading\` state). Pass an optional \`navigation\` object (\`onPrevious\`, \`onNext\`, \`hasPrevious\`, \`hasNext\`) to step through a gallery.

**When to use**
- To let users inspect an image (e.g. a generated or uploaded asset) at full resolution.
- To browse a set of images with previous/next navigation.

**Guidelines**
- Provide a \`downloadUrl\` when the image should be savable; the dialog renders a download affordance.
- Supply meaningful \`alt\` text for accessibility.
- For non-image modal content, use **Dialog** or **Sheet** instead.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ImageZoomDialogDemo = ({
  image,
  navigation,
}: {
  image: {
    src: string;
    alt?: string;
    title?: string;
    downloadUrl?: string;
    isLoading?: boolean;
  };
  navigation?: {
    onPrevious: () => void;
    onNext: () => void;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label="Open Image Zoom" onClick={() => setOpen(true)} />
      <ImageZoomDialog
        open={open}
        onOpenChange={setOpen}
        image={image}
        navigation={navigation}
      />
    </>
  );
};

export const Default: Story = {
  render: () => (
    <ImageZoomDialogDemo
      image={{
        src: SAMPLE_IMAGE,
        alt: "A sample droid avatar",
        title: "Droid Avatar",
      }}
    />
  ),
};

export const WithDownload: Story = {
  render: () => (
    <ImageZoomDialogDemo
      image={{
        src: SAMPLE_IMAGE,
        alt: "A sample droid avatar",
        title: "Droid_Lime_3.jpg",
        downloadUrl: SAMPLE_IMAGE,
      }}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <ImageZoomDialogDemo
      image={{
        src: SAMPLE_IMAGE,
        alt: "Loading image",
        title: "Loading...",
        isLoading: true,
      }}
    />
  ),
};

export const WithNavigation: Story = {
  render: () => {
    const images = [
      "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
      "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
      "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
    ];
    const [open, setOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    return (
      <>
        <Button label="Open Image Gallery" onClick={() => setOpen(true)} />
        <ImageZoomDialog
          open={open}
          onOpenChange={setOpen}
          image={{
            src: images[currentIndex],
            alt: `Image ${currentIndex + 1}`,
            title: `Image_${currentIndex + 1}.jpg`,
          }}
          navigation={{
            onPrevious: () => setCurrentIndex((i) => Math.max(0, i - 1)),
            onNext: () =>
              setCurrentIndex((i) => Math.min(images.length - 1, i + 1)),
            hasPrevious: currentIndex > 0,
            hasNext: currentIndex < images.length - 1,
          }}
        />
      </>
    );
  },
};
