import type { Meta } from "@storybook/react";
import React from "react";

import { Chip } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;

const colors = [
  "emerald",
  "amber",
  "slate",
  "violet",
  "warning",
  "sky",
  "pink",
  "indigo",
  "action",
] as const;

export const ListChipsExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-gap-2">
      {colors.map((color) => (
        <Chip key={`xs-${color}`} size="xs" label={color} color={color} />
      ))}
    </div>
    <div className="s-flex s-gap-2">
      {colors.map((color) => (
        <Chip key={`xs-${color}`} size="sm" label={color} color={color} />
      ))}
    </div>
  </div>
);
