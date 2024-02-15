import type { Meta } from "@storybook/react";
import React from "react";

import { Chip, UserGroupIcon } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Chip",
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;

const colors = [
  "emerald",
  "amber",
  "slate",
  "purple",
  "warning",
  "sky",
  "pink",
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
          <Chip
            key={`xs-${color}`}
            size="xs"
            label={color}
            color={color}
            icon={UserGroupIcon}
          />
        ))}
      </Chip.List>
    </div>
    <div className="s-w-60">
      <Chip.List isWrapping={true}>
        {colors.map((color) => (
          <Chip
            key={`xs-${color}`}
            size="sm"
            label={color}
            color={color}
            icon={UserGroupIcon}
          />
        ))}
      </Chip.List>
    </div>
  </div>
);
