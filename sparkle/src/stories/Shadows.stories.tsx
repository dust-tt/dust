import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

const meta = {
  title: "Foundations/Shadows",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `The elevation scale: box shadows (\`shadow\` through \`shadow-2xl\`) for surfaces and drop shadows (\`drop-shadow-*\`) for irregular shapes. Apply these Tailwind utilities to convey elevation consistently, reserving larger shadows for higher, more transient surfaces like popovers and dialogs.`,
      },
    },
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
  <div className="flex flex-col items-center gap-2">
    <div className={`h-24 w-24 rounded-lg bg-background ${shadowClass}`} />
    <span className="text-sm text-primary-600">{label}</span>
  </div>
);

export const BoxShadows: Story = {
  render: () => (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-semibold">Box Shadows</h2>
      <div className="flex flex-wrap gap-8">
        <ShadowBox label="Default" shadowClass="shadow" />
        <ShadowBox label="Medium" shadowClass="shadow-md" />
        <ShadowBox label="Large" shadowClass="shadow-lg" />
        <ShadowBox label="Extra Large" shadowClass="shadow-xl" />
        <ShadowBox label="2XL" shadowClass="shadow-2xl" />
      </div>
    </div>
  ),
};

export const DropShadows: Story = {
  render: () => (
    <div className="p-8">
      <h2 className="mb-6 text-xl font-semibold">Drop Shadows</h2>
      <div className="flex flex-wrap gap-8">
        <ShadowBox label="Default" shadowClass="drop-shadow" />
        <ShadowBox label="Small" shadowClass="drop-shadow-sm" />
        <ShadowBox label="Medium" shadowClass="drop-shadow-md" />
        <ShadowBox label="Large" shadowClass="drop-shadow-lg" />
        <ShadowBox label="Extra Large" shadowClass="drop-shadow-xl" />
        <ShadowBox label="2XL" shadowClass="drop-shadow-2xl" />
      </div>
    </div>
  ),
};
