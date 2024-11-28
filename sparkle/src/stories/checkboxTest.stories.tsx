import type { Meta } from "@storybook/react";
import React from "react";

import { Checkbox } from "../components/Checkbox";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;

// Basic example
export const Basic = () => <Checkbox />;

// Variants example
export const Variants = () => (
  <div className="flex gap-4">
    <Checkbox variant="default" />
    <Checkbox variant="success" />
    <Checkbox variant="error" />
  </div>
);

// Sizes example
export const Sizes = () => (
  <div className="flex gap-4">
    <Checkbox size="sm" />
    <Checkbox size="default" />
    <Checkbox size="lg" />
  </div>
);

// States example
export const States = () => (
  <div className="flex gap-4">
    <Checkbox checked />
    <Checkbox disabled />
    <Checkbox checked disabled />
  </div>
);
