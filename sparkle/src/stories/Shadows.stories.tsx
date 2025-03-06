import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

const meta = {
  title: "Theme/Shadows",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ShadowBox = ({
  label,
  shadowClass,
}: {
  label: string;
  shadowClass: string;
}) => (
  <div className="s-flex s-flex-col s-items-center s-gap-2">
    <div
      className={`s-h-24 s-w-24 s-rounded-lg s-bg-white dark:s-bg-gray-800 ${shadowClass}`}
    />
    <span className="s-text-sm s-text-gray-600 dark:s-text-gray-400">
      {label}
    </span>
  </div>
);

export const BoxShadows: Story = {
  render: () => (
    <div className="s-p-8">
      <h2 className="s-mb-6 s-text-xl s-font-semibold">Box Shadows</h2>
      <div className="s-flex s-flex-wrap s-gap-8">
        <ShadowBox label="Default" shadowClass="s-shadow" />
        <ShadowBox label="Medium" shadowClass="s-shadow-md" />
        <ShadowBox label="Large" shadowClass="s-shadow-lg" />
        <ShadowBox label="Extra Large" shadowClass="s-shadow-xl" />
        <ShadowBox label="2XL" shadowClass="s-shadow-2xl" />
      </div>
    </div>
  ),
};

export const DropShadows: Story = {
  render: () => (
    <div className="s-p-8">
      <h2 className="s-mb-6 s-text-xl s-font-semibold">Drop Shadows</h2>
      <div className="s-flex s-flex-wrap s-gap-8">
        <ShadowBox label="Default" shadowClass="s-drop-shadow" />
        <ShadowBox label="Small" shadowClass="s-drop-shadow-sm" />
        <ShadowBox label="Medium" shadowClass="s-drop-shadow-md" />
        <ShadowBox label="Large" shadowClass="s-drop-shadow-lg" />
        <ShadowBox label="Extra Large" shadowClass="s-drop-shadow-xl" />
        <ShadowBox label="2XL" shadowClass="s-drop-shadow-2xl" />
      </div>
    </div>
  ),
};
