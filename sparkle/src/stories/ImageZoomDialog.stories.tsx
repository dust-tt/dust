import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { Button, ImageZoomDialog } from "../index_with_tw_base";

const SAMPLE_IMAGE = "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg";

const meta: Meta<typeof ImageZoomDialog> = {
  title: "Components/ImageZoomDialog",
  component: ImageZoomDialog,
  tags: ["autodocs"],
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
