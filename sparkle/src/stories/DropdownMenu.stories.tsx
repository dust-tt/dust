import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Robot } from "@sparkle/icons/solid";

import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  DropdownMenu,
  PlanetIcon,
  SliderToggle,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;

export const DropdownExample = () => {
  const [isToggled, setIsToggled] = useState(false);

  const handleToggle = () => {
    setIsToggled((prevState) => !prevState);
  };

  return (
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
      <div className="s-h-12" />
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
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Top left menu</div>
        <DropdownMenu>
          <DropdownMenu.Button
            icon={ChatBubbleBottomCenterTextIcon}
            tooltip="Moonlab"
            tooltipPosition="below"
          />
          <DropdownMenu.Items origin="topLeft">
            <DropdownMenu.Item label="item 1" href="#" />
            <DropdownMenu.Item label="item 2" href="#" />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
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
      <div className="s-h-12" />
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
      <div className="s-h-12" />
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
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">With custom button</div>
        <DropdownMenu>
          <DropdownMenu.Button>
            <Avatar name="Dust" size="lg" onClick={() => ""} />
          </DropdownMenu.Button>
          <DropdownMenu.Items origin="topRight">
            <DropdownMenu.Item label="item 1" href="#" />
            <DropdownMenu.Item label="item 2" href="#" />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">With custom menu</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={Robot} />
          <DropdownMenu.Items origin="topRight">
            <div className="s-flex s-flex-col s-gap-2 s-p-3">
              testing custom stuff
              <Button label="hello" />
              <SliderToggle selected={isToggled} onClick={handleToggle} />
            </div>
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </>
  );
};
