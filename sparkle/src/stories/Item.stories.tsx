import type { Meta } from "@storybook/react";
import React from "react";

import {
  ArrowRightIcon,
  DropdownMenu,
  Item,
  LightbulbIcon,
  PlusIcon,
} from "../index_with_tw_base";
import { Cog6ToothIcon } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Item",
  component: Item,
} satisfies Meta<typeof Item>;

export default meta;

export const ListItemExample = () => (
  <div className="s-grid s-grid-cols-3 s-gap-8">
    <div>
      Entry example:
      <div className="s-w-70 s-flex s-justify-start s-bg-structure-50 s-p-8 dark:s-bg-structure-50-dark">
        <Item.List className="s-w-full">
          <Item.SectionHeader label="Section Header" />
          <Item.Entry
            label="Deploying a new Sparkle Icon set and GitHub action"
            selected
          />
          <Item.Entry label="Item 2" />
          <Item.Entry label="Adding custom colors and color schemes to Tailwind" />
          <Item.SectionHeader label="Section Header" />
          <Item.Entry label="Deploying a new Sparkle Icon set and GitHub action" />
          <Item.Entry label="Item 2" />
          <Item.Entry label="Adding custom colors and color schemes to Tailwind" />
        </Item.List>
      </div>
    </div>
    <div>
      Navigation example:
      <Item.List className="s-w-40">
        <Item.SectionHeader label="Section Header" variant="secondary" />
        <Item.Navigation label="Item 1" icon={Cog6ToothIcon} selected />
        <Item.Navigation label="Item 2" icon={Cog6ToothIcon} />
        <Item.Navigation label="Item 3" icon={Cog6ToothIcon} disabled />
        <Item.SectionHeader label="Section Header" variant="secondary" />
        <Item.Navigation
          label="Item 1"
          icon={Cog6ToothIcon}
          description="Desciption of the item"
        />
        <Item.Navigation
          label="Item 2"
          icon={Cog6ToothIcon}
          description="Desciption of the item"
        />
        <Item.Navigation
          label="Item 3"
          icon={Cog6ToothIcon}
          description="Desciption of the item"
          disabled
        />
        <Item.Navigation
          label="Item 4"
          icon={Cog6ToothIcon}
          description="Custom action icon"
          action={PlusIcon}
        />

        <Item.Navigation
          label="Item 5"
          icon={Cog6ToothIcon}
          description="No action icon (so no chevron)"
          hasAction={false}
        />
      </Item.List>
    </div>
    <div className="s-flex s-flex-col s-gap-8">
      Dropdown example:
      <div>
        <DropdownMenu>
          <DropdownMenu.Button label="Dust" />
          <DropdownMenu.Items>
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div>
        <DropdownMenu>
          <DropdownMenu.Button label="Dust" />
          <DropdownMenu.Items>
            <DropdownMenu.Item
              label="item 1"
              link={{ href: "#" }}
              icon={Cog6ToothIcon}
            />
            <DropdownMenu.Item
              label="item 2"
              link={{ href: "#" }}
              icon={Cog6ToothIcon}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div>
        <DropdownMenu>
          <DropdownMenu.Button label="Dust" />
          <DropdownMenu.Items>
            <DropdownMenu.Item
              label="item 1"
              link={{ href: "#" }}
              icon={Cog6ToothIcon}
              description="Desciption of the item"
            />
            <DropdownMenu.Item
              label="Dust site"
              link={{ href: "https://dust.tt", target: "_blank" }}
              icon={Cog6ToothIcon}
              description="Desciption of the item"
            />
            <DropdownMenu.Item
              label="item 1"
              link={{ href: "#" }}
              icon={Cog6ToothIcon}
              description="Desciption of the item"
            />
            <DropdownMenu.Item
              label="item 2"
              link={{ href: "#" }}
              icon={Cog6ToothIcon}
              description="Desciption of the item"
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </div>

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
    <div>
      Link example:
      <Item.List className="s-w-40">
        <Item.Link label="Quick start guide" icon={LightbulbIcon} />
        <Item.Link
          label="Building an assistanty"
          description="description of the avatar"
          icon={ArrowRightIcon}
        />
      </Item.List>
    </div>
  </div>
);
