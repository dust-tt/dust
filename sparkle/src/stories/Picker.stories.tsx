import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { fn } from "storybook/test";

import { Paint } from "@sparkle/icons";
import { ActionIcons } from "@sparkle/icons";

import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "../components";
import { ColorPicker, IconPicker } from "../components/Picker";
import { EmojiPicker } from "../index_with_tw_base";
import { FaceSmile } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Forms & Inputs/Picker",
  component: IconPicker,
  parameters: {
    docs: {
      description: {
        component: `A family of grid-based selection pickers for choosing a visual token. **IconPicker** lists named **icons** with **selectedIcon** and **onIconSelect**; **ColorPicker** presents a palette of **colors** with a **selectedColor** and **onColorSelect**; **EmojiPicker** wraps emoji-mart for emoji selection via **onEmojiSelect**.

**When to use**
- To let users pick an accent colour, icon, or emoji when customising an entity (agent avatar, folder, label).

**Guidelines**
- These pickers render the grid only; mount them inside a **PopoverRoot** / **PopoverContent** triggered by a **Button** as shown in the stories.
- Keep the current value in state and close the popover in the select callback for a single-pick interaction.`,
      },
    },
  },
} satisfies Meta<typeof IconPicker>;

export default meta;
type Story = StoryObj;

const COLORS = [
  "bg-gray-100",
  "bg-gray-200",
  "bg-gray-300",
  "bg-gray-400",
  "bg-gray-500",
  "bg-gray-600",
  "bg-gray-700",
  "bg-gray-800",
  "bg-blue-100",
  "bg-blue-200",
  "bg-blue-300",
  "bg-blue-400",
  "bg-blue-500",
  "bg-blue-600",
  "bg-blue-700",
  "bg-blue-800",
  "bg-violet-100",
  "bg-violet-200",
  "bg-violet-300",
  "bg-violet-400",
  "bg-violet-500",
  "bg-violet-600",
  "bg-violet-700",
  "bg-violet-800",
  "bg-pink-100",
  "bg-pink-200",
  "bg-pink-300",
  "bg-pink-400",
  "bg-pink-500",
  "bg-pink-600",
  "bg-pink-700",
  "bg-pink-800",
  "bg-red-100",
  "bg-red-200",
  "bg-red-300",
  "bg-red-400",
  "bg-red-500",
  "bg-red-600",
  "bg-red-700",
  "bg-red-800",
  "bg-orange-100",
  "bg-orange-200",
  "bg-orange-300",
  "bg-orange-400",
  "bg-orange-500",
  "bg-orange-600",
  "bg-orange-700",
  "bg-orange-800",
  "bg-golden-100",
  "bg-golden-200",
  "bg-golden-300",
  "bg-golden-400",
  "bg-golden-500",
  "bg-golden-600",
  "bg-golden-700",
  "bg-golden-800",
  "bg-lime-100",
  "bg-lime-200",
  "bg-lime-300",
  "bg-lime-400",
  "bg-lime-500",
  "bg-lime-600",
  "bg-lime-700",
  "bg-lime-800",
  "bg-emerald-100",
  "bg-emerald-200",
  "bg-emerald-300",
  "bg-emerald-400",
  "bg-emerald-500",
  "bg-emerald-600",
  "bg-emerald-700",
  "bg-emerald-800",
];

const onEmojiSelect = fn();

const IconPickerDemo = () => {
  const [selectedIcon, setSelectedIcon] = useState(Object.keys(ActionIcons)[0]);
  const [isOpen, setIsOpen] = useState(false);
  const SelectedIcon = ActionIcons[selectedIcon as keyof typeof ActionIcons];

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          label="Select Icon"
          variant="outline"
          size="sm"
          icon={SelectedIcon}
          isSelect
        />
      </PopoverTrigger>
      <PopoverContent className="w-fit p-0">
        <IconPicker
          icons={ActionIcons}
          selectedIcon={selectedIcon}
          onIconSelect={(iconName: string) => {
            setSelectedIcon(iconName);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
};

/**
 * Documents **IconPicker**: a searchable grid of named icons in a popover;
 * the selected icon name drives the trigger button's icon.
 * @summary IconPicker in a popover with stateful selection.
 */
export const PickIcon: Story = {
  render: () => <IconPickerDemo />,
};

const ColorPickerDemo = () => {
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          label="Select Color"
          variant="outline"
          icon={Paint}
          size="sm"
          className={selectedColor}
          isSelect
        />
      </PopoverTrigger>
      <PopoverContent className="w-fit">
        <ColorPicker
          colors={COLORS}
          selectedColor={selectedColor}
          onColorSelect={(color: string) => {
            setSelectedColor(color);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
};

/**
 * Documents **ColorPicker**: a palette grid mounted in a popover, with the
 * chosen color kept in state and reflected on the trigger button.
 * @summary ColorPicker in a popover with stateful selection.
 */
export const PickColor: Story = {
  render: () => <ColorPickerDemo />,
};

const EmojiPickerDemo = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          label="Pick an Emoji"
          variant="outline"
          icon={FaceSmile}
          size="sm"
          isSelect
        />
      </PopoverTrigger>
      <PopoverContent fullWidth>
        <EmojiPicker
          theme="light"
          previewPosition="none"
          data={data as EmojiMartData}
          onEmojiSelect={(emoji) => {
            onEmojiSelect(emoji);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </PopoverRoot>
  );
};

/**
 * Documents **EmojiPicker**: the emoji-mart grid in a popover; the
 * selection is reported through \`onEmojiSelect\` (spied with \`fn()\`)
 * and closes the popover.
 * @summary EmojiPicker in a popover with a spied select callback.
 */
export const PickEmoji: Story = {
  render: () => <EmojiPickerDemo />,
};
