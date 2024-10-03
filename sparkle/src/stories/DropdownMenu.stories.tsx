import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ClipboardIcon,
  DocumentDuplicateIcon,
  DropdownMenu,
  EyeIcon,
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
  title: "Components/DropdownMenu",
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
          <DropdownMenu.Button
            label="Action"
            onClick={() => console.log("CLICK")}
          />
          <DropdownMenu.Items width={220}>
            <DropdownMenu.SectionHeader label="Edition" />
            <DropdownMenu.Item
              label="Edit"
              link={{ href: "#" }}
              icon={PencilSquareIcon}
            />
            <DropdownMenu.Item
              label="Duplicate (New)"
              link={{ href: "#" }}
              icon={ClipboardIcon}
            />
            <DropdownMenu.Item
              label="Archive"
              link={{ href: "#" }}
              icon={TrashIcon}
              variant="warning"
            />
            <DropdownMenu.Item
              label="Dust site"
              link={{ href: "https://dust.tt", target: "_blank" }}
              icon={EyeIcon}
            />
            <DropdownMenu.SectionHeader label="Sharing" />
            <DropdownMenu.Item
              label="Company Assistant"
              link={{ href: "#" }}
              icon={PlanetIcon}
            />
            <DropdownMenu.Item
              label="Shared Assistant"
              link={{ href: "#" }}
              selected
              icon={UserGroupIcon}
            />
            <DropdownMenu.Item
              label="Personal Assistant"
              link={{ href: "#" }}
              icon={LockIcon}
            />
            <DropdownMenu.SectionHeader label="My Assistants" />
            <DropdownMenu.Item
              label="Add to my list"
              link={{ href: "#" }}
              icon={ListAddIcon}
            />
            <DropdownMenu.Item
              label="Remove from my list"
              link={{ href: "#" }}
              icon={ListRemoveIcon}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />

      <div className="s-flex s-gap-6 s-pb-8">
        <div className="s-text-sm">Custom Dropdown:</div>
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              label="Advanced settings"
              variant="tertiary"
              size="sm"
              type="select"
            />
          </DropdownMenu.Button>
          <DropdownMenu.Items width={300} overflow="visible">
            <div className="s-flex s-flex-col s-gap-4">
              <div className="s-flex s-flex-row s-items-center s-gap-2">
                <div className="s-grow s-text-sm s-text-element-900">
                  Model selection:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label="GPT4"
                      variant="tertiary"
                      hasMagnifying={false}
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topRight">
                    {["GPT4", "GPT3", "GPT2", "GPT1"].map((item) => (
                      <DropdownMenu.Item
                        key={item}
                        label={item}
                        onClick={() => {
                          // setGenerationSettings({
                          //   ...generationSettings,
                          //   model: item,
                          // });
                        }}
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
              <div className="s-flex s-flex-row s-items-center s-gap-2">
                <div className="s-grow s-text-sm s-text-element-900">
                  Creativity level:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label="Balanced"
                      variant="tertiary"
                      hasMagnifying={false}
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topRight">
                    {["Deterministic", "Factual", "Balanced", "Creative"].map(
                      (item) => (
                        <DropdownMenu.Item
                          key={item}
                          label={item}
                          onClick={() => {
                            // setGenerationSettings({
                            //   ...generationSettings,
                            //   model: item,
                            // });
                          }}
                        />
                      )
                    )}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </div>
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>

      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Assistant selector menu example:</div>
        <DropdownMenu>
          {({ close }) => (
            <>
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
                      onClick={close}
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
            </>
          )}
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Long items small width</div>
        <DropdownMenu>
          <DropdownMenu.Button
            icon={ChatBubbleBottomCenterTextIcon}
            tooltip="Moonlab"
            tooltipPosition="bottom"
          />
          <DropdownMenu.Items origin="topLeft" width={120}>
            <DropdownMenu.Item label="item 1 is longish" link={{ href: "#" }} />
            <DropdownMenu.Item
              label="item 2 is also longer"
              link={{ href: "#" }}
            />
            <DropdownMenu.Item
              label="item with a long title because it is long"
              link={{ href: "#" }}
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
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Top right menu</div>
        <DropdownMenu>
          <DropdownMenu.Button label="Moonlab" icon={PlanetIcon} size="md" />
          <DropdownMenu.Items>
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
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
            tooltipPosition="bottom"
          />
          <DropdownMenu.Items origin="topLeft">
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
            <DropdownMenu.Item
              label="item 2 with a long title because it is long"
              link={{ href: "#" }}
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
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Bottom right menu</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={ChatBubbleBottomCenterTextIcon} />
          <DropdownMenu.Items origin="bottomRight">
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
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
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Type = Select</div>
        <DropdownMenu>
          <DropdownMenu.Button type="select" label="Every 6 months" />
          <DropdownMenu.Items origin="topRight">
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
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
              <DropdownMenu.Item label={item} link={{ href: "#" }} key={item} />
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
            <div className="s-flex s-flex-col s-gap-2">
              testing custom stuff
              <Button label="hello" />
              <SliderToggle selected={isToggled} onClick={handleToggle} />
            </div>
          </DropdownMenu.Items>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              variant="tertiary"
              size="xs"
              icon={EyeIcon}
              label="See the error"
            />
          </DropdownMenu.Button>
          <div className="relative bottom-6 z-30">
            <DropdownMenu.Items origin="topLeft" width={320}>
              <div className="text-sm font-normal text-warning-800">
                Hello error messange!
              </div>
              <div className="self-end">
                <Button
                  variant="tertiary"
                  size="xs"
                  icon={DocumentDuplicateIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText("Hello error messange!")
                  }
                />
              </div>
            </DropdownMenu.Items>
          </div>
        </DropdownMenu>
      </div>
      <div className="s-h-12" />
      <div className="s-flex s-gap-6">
        <div className="s-text-sm">With nested dropdown</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={RobotIcon} />
          <DropdownMenu.Items origin="topRight" overflow="visible">
            <DropdownMenu>
              <DropdownMenu.Button label="Nested" />
              <DropdownMenu.Items origin="topRight">
                <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
                <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
              </DropdownMenu.Items>
            </DropdownMenu>
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="w-full s-flex s-justify-end s-gap-6">
        <div className="s-text-sm">Auto menu</div>
        <DropdownMenu>
          <DropdownMenu.Button label="Moonlab" icon={PlanetIcon} />
          <DropdownMenu.Items origin="auto">
            <DropdownMenu.Item label="item 1" link={{ href: "#" }} />
            <DropdownMenu.Item label="item 2" link={{ href: "#" }} />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>

      <div className="s-flex s-gap-6">
        <div className="s-text-sm">Don't close on escape or space</div>
        <DropdownMenu>
          <DropdownMenu.Button icon={RobotIcon} />
          <DropdownMenu.Items
            origin="topRight"
            onKeyDown={(e) => e.preventDefault()}
          >
            <DropdownMenu.Item label="@gpt4" />
            <DropdownMenu.Item label="@slack" />
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </>
  );
};
