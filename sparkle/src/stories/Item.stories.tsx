import type { Meta } from "@storybook/react";
import React from "react";

import { Item } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;

export const ListItemExample = () => (
  <div className="s-grid s-grid-cols-3 s-gap-8">
    <div>
      Avatar example:
      <Item.List className="s-w-40">
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Black_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Pink_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Red_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          description="description of the avatar"
          visual="https://dust.tt/static/droidavatar/Droid_Teal_2.jpg"
          disabled
        />
      </Item.List>
    </div>

    <div>
      Avatar example:
      <Item.List className="s-w-40">
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Black_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Pink_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Orange_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Red_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Lime_2.jpg"
        />
        <Item.Avatar
          label="@handle"
          visual="https://dust.tt/static/droidavatar/Droid_Teal_2.jpg"
          disabled
        />
      </Item.List>
    </div>
  </div>
);
