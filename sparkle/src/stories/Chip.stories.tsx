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
  "red",
] as const;

export const ListChipsExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <Chip.List>
      {colors.map((color) => (
        <Chip key={`xs-${color}`} size="xs" label={color} color={color} />
      ))}
    </Chip.List>
    <Chip.List>
      {colors.map((color) => (
        <Chip key={`sm-${color}`} size="sm" label={color} color={color} />
      ))}
    </Chip.List>
    <div className="s-w-60">
      <Chip.List isWrapping={true}>
        {colors.map((color) => (
          <Chip key={`xs-${color}`} size="xs" label={color} color={color} />
        ))}
      </Chip.List>
    </div>
  </div>
);
