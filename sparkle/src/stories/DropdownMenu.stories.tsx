import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  PlanetIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DropdownExample = () => (
  <>
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Workspace</div>
      <DropdownMenu>
        <DropdownMenu.Button label="Dust" />
        <DropdownMenu.Items>
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
    <div className="s-h-8" />
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Top right menu</div>
      <DropdownMenu>
        <DropdownMenu.Button label="Moonlab" icon={PlanetIcon} />
        <DropdownMenu.Items>
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
    <div className="s-h-8" />
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Top left menu</div>
      <DropdownMenu>
        <DropdownMenu.Button icon={ChatBubbleBottomCenterTextIcon} />
        <DropdownMenu.Items origin="topLeft">
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
    <div className="s-h-8" />
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Bottom left menu</div>
      <DropdownMenu>
        <DropdownMenu.Button icon={ChatBubbleBottomCenterTextIcon} />
        <DropdownMenu.Items origin="bottomLeft">
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
    <div className="s-h-8" />
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Bottom right menu</div>
      <DropdownMenu>
        <DropdownMenu.Button icon={ChatBubbleBottomCenterTextIcon} />
        <DropdownMenu.Items origin="bottomRight">
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
    <div className="s-h-8" />
    <div className="s-flex s-gap-6">
      <div className="s-text-sm">Disabled</div>
      <DropdownMenu>
        <DropdownMenu.Button
          label="Moonlab"
          icon={ChatBubbleBottomCenterTextIcon}
          disabled
        />
        <DropdownMenu.Items>
          <DropdownMenu.Item label="item 1" href="#" />
          <DropdownMenu.Item label="item 2" href="#" />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
  </>
);
