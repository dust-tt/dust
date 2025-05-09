import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { PaintIcon } from "@sparkle/icons";
import { ActionIcons } from "@sparkle/icons";
import { EmotionLaughIcon } from "@sparkle/icons/app";

import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "../components";
import { ColorPicker, IconPicker } from "../components/Picker";
import { EmojiPicker } from "../index_with_tw_base";

const meta = {
  title: "Components/Picker",
  component: ColorPicker,
} satisfies Meta<typeof ColorPicker>;

export default meta;

const colors = [
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

const ColorPickerExample = () => {
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="s-mt-14 s-flex s-flex-col s-items-center s-gap-6">
      <div className="s-w-full s-max-w-2xl">
        <h3 className="s-mb-4 s-text-lg s-font-medium">Color Picker</h3>
        <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              label="Select Color"
              variant="outline"
              icon={PaintIcon}
              size="sm"
              className={selectedColor}
              isSelect
            />
          </PopoverTrigger>
          <PopoverContent className="s-w-fit">
            <ColorPicker
              colors={colors}
              selectedColor={selectedColor}
              onColorSelect={(color: string) => {
                setSelectedColor(color);
                setIsOpen(false);
              }}
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    </div>
  );
};

const IconPickerExample = () => {
  const [selectedIcon, setSelectedIcon] = useState(Object.keys(ActionIcons)[0]);
  const [isOpen, setIsOpen] = useState(false);
  const SelectedIcon = ActionIcons[selectedIcon as keyof typeof ActionIcons];

  return (
    <div className="s-mt-14 s-flex s-flex-col s-items-center s-gap-6">
      <div className="s-w-full s-max-w-2xl">
        <h3 className="s-mb-4 s-text-lg s-font-medium">Icon Picker</h3>
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
          <PopoverContent className="s-w-fit s-py-0">
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
      </div>
    </div>
  );
};

const EmojiPickerExample = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="s-mt-14 s-flex s-flex-col s-items-center s-gap-6">
      <div className="s-w-full s-max-w-2xl">
        <h3 className="s-mb-4 s-text-lg s-font-medium">Emoji Picker</h3>
        <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              label="Pick an Emoji"
              variant="outline"
              icon={EmotionLaughIcon}
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
                alert(emoji.native);
                setIsOpen(false);
              }}
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    </div>
  );
};

export { ColorPickerExample, EmojiPickerExample, IconPickerExample };
