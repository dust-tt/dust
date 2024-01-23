import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DropdownMenu,
  ListAddIcon,
  ListIcon,
  ListRemoveIcon,
  LockIcon,
  PencilSquareIcon,
  PlanetIcon,
  PlusIcon,
  RobotIcon,
  Searchbar,
  SliderToggle,
  TrashIcon,
  UserGroupIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Atoms/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;

export const DropdownExample = () => {
  const [inputValue, setInputValue] = useState("");

  const handleChange = (value: string) => {
    setInputValue(value);
  };

  const [isToggled, setIsToggled] = useState(false);

  const handleToggle = () => {
    setIsToggled((prevState) => !prevState);
  };

  return (
    <>
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Action</div>
        <DropdownMenu>
          <DropdownMenu.Button label="Action" />
          <DropdownMenu.Items width={220}>
            <DropdownMenu.SectionHeader label="Edition" />
            <DropdownMenu.Item label="Edit" href="#" icon={PencilSquareIcon} />
            <DropdownMenu.Item
              label="Duplicate (New)"
              href="#"
              icon={ClipboardIcon}
            />
            <DropdownMenu.Item
              label="Archive"
              href="#"
              icon={TrashIcon}
              variant="warning"
            />
            <DropdownMenu.SectionHeader label="Sharing" />
            <DropdownMenu.Item
              label="Company Assistant"
              href="#"
              icon={PlanetIcon}
            />
            <DropdownMenu.Item
              label="Shared Assistant"
              href="#"
              selected
              icon={UserGroupIcon}
            />
            <DropdownMenu.Item
              label="Personal Assistant"
              href="#"
              icon={LockIcon}
            />
            <DropdownMenu.SectionHeader label="My Assistants" />
            <DropdownMenu.Item
              label="Add to my list"
              href="#"
              icon={ListAddIcon}
            />
            <DropdownMenu.Item
              label="Remove from my list"
              href="#"
              icon={ListRemoveIcon}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Assistant selector menu example:</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={RobotIcon} />
          <DropdownMenu.Items
            width={240}
            origin="topRight"
            topBar={
              <div className="s-flex s-flex-grow s-flex-row s-border-b s-border-structure-50 s-p-2">
                <Searchbar
                  placeholder="Placeholder"
                  size="xs"
                  name="input"
                  value={inputValue}
                  onChange={handleChange}
                  className="s-w-full"
                ></Searchbar>
              </div>
            }
            bottomBar={
              <div className="s-flex s-border-t s-border-structure-50 s-p-2">
                <Button
                  label="Manage"
                  variant="tertiary"
                  size="xs"
                  icon={ListIcon}
                />
                <div className="s-flex-grow" />
                <Button
                  label="New"
                  variant="secondary"
                  size="xs"
                  icon={PlusIcon}
                />
              </div>
            }
          >
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@gpt4"
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
            />
            <DropdownMenu.Item
              label="@slack"
              visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
            />
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
          <DropdownMenu.Items origin="topLeft" width={200}>
            <DropdownMenu.Item label="No action" href="#" />
            <DropdownMenu.Item label="Search data sources" href="#" />
            <DropdownMenu.Item label="Advanced actions" hasChildren={true}>
              <DropdownMenu.Items origin="topLeft" width={360} marginLeft={40}>
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
        <div className="s-text-sm">With visuals in items</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={RobotIcon} />
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
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">With custom menu</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={RobotIcon} />
          <DropdownMenu.Items origin="topRight">
            <div className="s-flex s-flex-col s-gap-2 s-p-3">
              testing custom stuff
              <Button label="hello" />
              <SliderToggle selected={isToggled} onClick={handleToggle} />
            </div>
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
