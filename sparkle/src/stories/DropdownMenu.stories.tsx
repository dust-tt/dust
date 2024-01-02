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
        <div className="s-text-sm">Long items small width</div>
        <DropdownMenu>
          <DropdownMenu.Button
            icon={ChatBubbleBottomCenterTextIcon}
            tooltip="Moonlab"
            tooltipPosition="below"
          />
          <DropdownMenu.Items origin="topLeft" width={120}>
            <DropdownMenu.Item label="item 1 is longish" href="#" />
            <DropdownMenu.Item label="item 2 is also longer" href="#" />
            <DropdownMenu.Item
              label="item with a long title because it is long"
              href="#"
            />
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
        <div className="s-text-sm">Top right menu</div>
        <DropdownMenu>
          <DropdownMenu.Button label="Moonlab" icon={PlanetIcon} size="md" />
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
            <DropdownMenu.Item
              label="item 2 with a long title because it is long"
              href="#"
            />
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
        <div className="s-text-sm">Type = Select</div>
        <DropdownMenu>
          <DropdownMenu.Button type="select" label="Every 6 months" />
          <DropdownMenu.Items origin="topRight">
            <DropdownMenu.Item label="item 1" href="#" />
            <DropdownMenu.Item label="item 2" href="#" />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>

      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">SubMenu</div>
        <DropdownMenu>
          <DropdownMenu.Button type="select" label="No action" />
          <DropdownMenu.Items origin="topLeft" width={300}>
            <DropdownMenu.Item label="No action" href="#" />
            <DropdownMenu.Item label="Search data sources" href="#" />
            <DropdownMenu.Item label="Advanced actions" hasChildren={true}>
              <DropdownMenu.Items origin="topLeft" width={360}>
                <DropdownMenu.Item
                  label="Retrieve most recent content from data sources"
                  href="#"
                />
                <DropdownMenu.Item
                  label="Run a Dust application and retrieve the output"
                  href="#"
                />
              </DropdownMenu.Items>
            </DropdownMenu.Item>
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
            {["item 1", "item 2", "item 3"].map((item) => (
              <DropdownMenu.Item label={item} href="#" key={item} />
            ))}
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
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">With visuals in items</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={Robot} />
          <DropdownMenu.Items origin="topRight">
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="w-full s-flex s-justify-end s-gap-6">
        <div className="s-text-sm">Auto menu</div>
        <DropdownMenu>
          <DropdownMenu.Button label="Moonlab" icon={PlanetIcon} />
          <DropdownMenu.Items origin="auto">
            <DropdownMenu.Item label="item 1" href="#" />
            <DropdownMenu.Item label="item 2" href="#" />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </>
  );
};
