import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Avatar } from "@sparkle/components";

const meta = {
  title: "Assets/AvatarSet",
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof Avatar>;

const avatarUrlList = {
  "Droid_Black_1.jpg": "https://dust.tt/static/droidavatar/Droid_Black_1.jpg",
  "Droid_Black_2.jpg": "https://dust.tt/static/droidavatar/Droid_Black_2.jpg",
  "Droid_Black_3.jpg": "https://dust.tt/static/droidavatar/Droid_Black_3.jpg",
  "Droid_Black_4.jpg": "https://dust.tt/static/droidavatar/Droid_Black_4.jpg",
  "Droid_Black_5.jpg": "https://dust.tt/static/droidavatar/Droid_Black_5.jpg",
  "Droid_Black_6.jpg": "https://dust.tt/static/droidavatar/Droid_Black_6.jpg",
  "Droid_Black_7.jpg": "https://dust.tt/static/droidavatar/Droid_Black_7.jpg",
  "Droid_Black_8.jpg": "https://dust.tt/static/droidavatar/Droid_Black_8.jpg",
  "Droid_Cream_1.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_1.jpg",
  "Droid_Cream_2.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_2.jpg",
  "Droid_Cream_3.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_3.jpg",
  "Droid_Cream_4.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_4.jpg",
  "Droid_Cream_5.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_5.jpg",
  "Droid_Cream_6.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_6.jpg",
  "Droid_Cream_7.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_7.jpg",
  "Droid_Cream_8.jpg": "https://dust.tt/static/droidavatar/Droid_Cream_8.jpg",
  "Droid_Green_1.jpg": "https://dust.tt/static/droidavatar/Droid_Green_1.jpg",
  "Droid_Green_2.jpg": "https://dust.tt/static/droidavatar/Droid_Green_2.jpg",
  "Droid_Green_3.jpg": "https://dust.tt/static/droidavatar/Droid_Green_3.jpg",
  "Droid_Green_4.jpg": "https://dust.tt/static/droidavatar/Droid_Green_4.jpg",
  "Droid_Green_5.jpg": "https://dust.tt/static/droidavatar/Droid_Green_5.jpg",
  "Droid_Green_6.jpg": "https://dust.tt/static/droidavatar/Droid_Green_6.jpg",
  "Droid_Green_7.jpg": "https://dust.tt/static/droidavatar/Droid_Green_7.jpg",
  "Droid_Green_8.jpg": "https://dust.tt/static/droidavatar/Droid_Green_8.jpg",
  "Droid_Indigo_1.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_1.jpg",
  "Droid_Indigo_2.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_2.jpg",
  "Droid_Indigo_3.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_3.jpg",
  "Droid_Indigo_4.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_4.jpg",
  "Droid_Indigo_5.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_5.jpg",
  "Droid_Indigo_6.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_6.jpg",
  "Droid_Indigo_7.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_7.jpg",
  "Droid_Indigo_8.jpg": "https://dust.tt/static/droidavatar/Droid_Indigo_8.jpg",
  "Droid_Lime_1.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
  "Droid_Lime_2.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_2.jpg",
  "Droid_Lime_3.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
  "Droid_Lime_4.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_4.jpg",
  "Droid_Lime_5.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_5.jpg",
  "Droid_Lime_6.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_6.jpg",
  "Droid_Lime_7.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_7.jpg",
  "Droid_Lime_8.jpg": "https://dust.tt/static/droidavatar/Droid_Lime_8.jpg",
  "Droid_Orange_1.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_1.jpg",
  "Droid_Orange_2.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_2.jpg",
  "Droid_Orange_3.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_3.jpg",
  "Droid_Orange_4.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_4.jpg",
  "Droid_Orange_5.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_5.jpg",
  "Droid_Orange_6.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_6.jpg",
  "Droid_Orange_7.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_7.jpg",
  "Droid_Orange_8.jpg": "https://dust.tt/static/droidavatar/Droid_Orange_8.jpg",
  "Droid_Pink_1.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_1.jpg",
  "Droid_Pink_2.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_2.jpg",
  "Droid_Pink_3.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
  "Droid_Pink_4.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_4.jpg",
  "Droid_Pink_5.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_5.jpg",
  "Droid_Pink_6.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_6.jpg",
  "Droid_Pink_7.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_7.jpg",
  "Droid_Pink_8.jpg": "https://dust.tt/static/droidavatar/Droid_Pink_8.jpg",
  "Droid_Purple_1.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_1.jpg",
  "Droid_Purple_2.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_2.jpg",
  "Droid_Purple_3.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_3.jpg",
  "Droid_Purple_4.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_4.jpg",
  "Droid_Purple_5.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_5.jpg",
  "Droid_Purple_6.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_6.jpg",
  "Droid_Purple_7.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_7.jpg",
  "Droid_Purple_8.jpg": "https://dust.tt/static/droidavatar/Droid_Purple_8.jpg",
  "Droid_Red_1.jpg": "https://dust.tt/static/droidavatar/Droid_Red_1.jpg",
  "Droid_Red_2.jpg": "https://dust.tt/static/droidavatar/Droid_Red_2.jpg",
  "Droid_Red_3.jpg": "https://dust.tt/static/droidavatar/Droid_Red_3.jpg",
  "Droid_Red_4.jpg": "https://dust.tt/static/droidavatar/Droid_Red_4.jpg",
  "Droid_Red_5.jpg": "https://dust.tt/static/droidavatar/Droid_Red_5.jpg",
  "Droid_Red_6.jpg": "https://dust.tt/static/droidavatar/Droid_Red_6.jpg",
  "Droid_Red_7.jpg": "https://dust.tt/static/droidavatar/Droid_Red_7.jpg",
  "Droid_Red_8.jpg": "https://dust.tt/static/droidavatar/Droid_Red_8.jpg",
  "Droid_Sky_1.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_1.jpg",
  "Droid_Sky_2.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_2.jpg",
  "Droid_Sky_3.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_3.jpg",
  "Droid_Sky_4.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_4.jpg",
  "Droid_Sky_5.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_5.jpg",
  "Droid_Sky_6.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_6.jpg",
  "Droid_Sky_7.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_7.jpg",
  "Droid_Sky_8.jpg": "https://dust.tt/static/droidavatar/Droid_Sky_8.jpg",
  "Droid_Teal_1.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_1.jpg",
  "Droid_Teal_2.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_2.jpg",
  "Droid_Teal_3.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_3.jpg",
  "Droid_Teal_4.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_4.jpg",
  "Droid_Teal_5.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_5.jpg",
  "Droid_Teal_6.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_6.jpg",
  "Droid_Teal_7.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_7.jpg",
  "Droid_Teal_8.jpg": "https://dust.tt/static/droidavatar/Droid_Teal_8.jpg",
  "Droid_Yellow_1.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_1.jpg",
  "Droid_Yellow_2.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg",
  "Droid_Yellow_3.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
  "Droid_Yellow_4.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg",
  "Droid_Yellow_5.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_5.jpg",
  "Droid_Yellow_6.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_6.jpg",
  "Droid_Yellow_7.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_7.jpg",
  "Droid_Yellow_8.jpg": "https://dust.tt/static/droidavatar/Droid_Yellow_8.jpg",
};

const spiritAvatarUrlList = {
  "Spirit_Black_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_1.jpg",
  "Spirit_Black_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_2.jpg",
  "Spirit_Black_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_3.jpg",
  "Spirit_Black_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_4.jpg",
  "Spirit_Black_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_5.jpg",
  "Spirit_Black_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_6.jpg",
  "Spirit_Black_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_7.jpg",
  "Spirit_Black_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Black_8.jpg",
  "Spirit_Cream_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_1.jpg",
  "Spirit_Cream_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_2.jpg",
  "Spirit_Cream_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_3.jpg",
  "Spirit_Cream_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_4.jpg",
  "Spirit_Cream_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_5.jpg",
  "Spirit_Cream_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_6.jpg",
  "Spirit_Cream_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_7.jpg",
  "Spirit_Cream_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Cream_8.jpg",
  "Spirit_Green_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_1.jpg",
  "Spirit_Green_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_2.jpg",
  "Spirit_Green_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_3.jpg",
  "Spirit_Green_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_4.jpg",
  "Spirit_Green_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_5.jpg",
  "Spirit_Green_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_6.jpg",
  "Spirit_Green_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_7.jpg",
  "Spirit_Green_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Green_8.jpg",
  "Spirit_Indigo_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_1.jpg",
  "Spirit_Indigo_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_2.jpg",
  "Spirit_Indigo_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_3.jpg",
  "Spirit_Indigo_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_4.jpg",
  "Spirit_Indigo_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_5.jpg",
  "Spirit_Indigo_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_6.jpg",
  "Spirit_Indigo_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_7.jpg",
  "Spirit_Indigo_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Indigo_8.jpg",
  "Spirit_Lime_1.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_1.jpg",
  "Spirit_Lime_2.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_2.jpg",
  "Spirit_Lime_3.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_3.jpg",
  "Spirit_Lime_4.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_4.jpg",
  "Spirit_Lime_5.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_5.jpg",
  "Spirit_Lime_6.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_6.jpg",
  "Spirit_Lime_7.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_7.jpg",
  "Spirit_Lime_8.jpg": "https://dust.tt/static/spiritavatar/Spirit_Lime_8.jpg",
  "Spirit_Orange_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_1.jpg",
  "Spirit_Orange_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_2.jpg",
  "Spirit_Orange_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_3.jpg",
  "Spirit_Orange_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_4.jpg",
  "Spirit_Orange_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_5.jpg",
  "Spirit_Orange_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_6.jpg",
  "Spirit_Orange_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_7.jpg",
  "Spirit_Orange_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Orange_8.jpg",
  "Spirit_Pink_1.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_1.jpg",
  "Spirit_Pink_2.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_2.jpg",
  "Spirit_Pink_3.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_3.jpg",
  "Spirit_Pink_4.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_4.jpg",
  "Spirit_Pink_5.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_5.jpg",
  "Spirit_Pink_6.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_6.jpg",
  "Spirit_Pink_7.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_7.jpg",
  "Spirit_Pink_8.jpg": "https://dust.tt/static/spiritavatar/Spirit_Pink_8.jpg",
  "Spirit_Purple_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_1.jpg",
  "Spirit_Purple_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_2.jpg",
  "Spirit_Purple_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_3.jpg",
  "Spirit_Purple_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_4.jpg",
  "Spirit_Purple_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_5.jpg",
  "Spirit_Purple_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_6.jpg",
  "Spirit_Purple_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_7.jpg",
  "Spirit_Purple_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Purple_8.jpg",
  "Spirit_Red_1.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_1.jpg",
  "Spirit_Red_2.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_2.jpg",
  "Spirit_Red_3.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_3.jpg",
  "Spirit_Red_4.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_4.jpg",
  "Spirit_Red_5.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_5.jpg",
  "Spirit_Red_6.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_6.jpg",
  "Spirit_Red_7.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_7.jpg",
  "Spirit_Red_8.jpg": "https://dust.tt/static/spiritavatar/Spirit_Red_8.jpg",
  "Spirit_Sky_1.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_1.jpg",
  "Spirit_Sky_2.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_2.jpg",
  "Spirit_Sky_3.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_3.jpg",
  "Spirit_Sky_4.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_4.jpg",
  "Spirit_Sky_5.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_5.jpg",
  "Spirit_Sky_6.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_6.jpg",
  "Spirit_Sky_7.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_7.jpg",
  "Spirit_Sky_8.jpg": "https://dust.tt/static/spiritavatar/Spirit_Sky_8.jpg",
  "Spirit_Teal_1.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_1.jpg",
  "Spirit_Teal_2.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_2.jpg",
  "Spirit_Teal_3.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_3.jpg",
  "Spirit_Teal_4.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_4.jpg",
  "Spirit_Teal_5.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_5.jpg",
  "Spirit_Teal_6.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_6.jpg",
  "Spirit_Teal_7.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_7.jpg",
  "Spirit_Teal_8.jpg": "https://dust.tt/static/spiritavatar/Spirit_Teal_8.jpg",
  "Spirit_Yellow_1.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_1.jpg",
  "Spirit_Yellow_2.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_2.jpg",
  "Spirit_Yellow_3.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_3.jpg",
  "Spirit_Yellow_4.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_4.jpg",
  "Spirit_Yellow_5.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_5.jpg",
  "Spirit_Yellow_6.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_6.jpg",
  "Spirit_Yellow_7.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_7.jpg",
  "Spirit_Yellow_8.jpg":
    "https://dust.tt/static/spiritavatar/Spirit_Yellow_8.jpg",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
  gap: "48px 16px",
};

const itemStyle = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

export const DroidAvatarSet: Story = {
  render: () => (
    <>
      <div className="s-py-4 s-text-base s-text-foreground dark:s-text-foreground-night">
        url is{" "}
        <span className="s-font-bold">
          "https://dust.tt/static/droidavatar/filename"
        </span>
      </div>
      <div style={gridStyle}>
        {Object.entries(avatarUrlList).map(([filename, url]) => (
          <div key={filename} style={itemStyle as React.CSSProperties}>
            <Avatar visual={url} size="md" />
            <div className="s-overflow-hidden s-text-ellipsis s-text-xs s-text-foreground dark:s-text-foreground-night">
              {filename}
            </div>
          </div>
        ))}
      </div>
    </>
  ),
};

export const SpiritAvatarSet: Story = {
  render: () => (
    <>
      <div className="s-py-4 s-text-base s-text-foreground dark:s-text-foreground-night">
        url is{" "}
        <span className="s-font-bold">
          "https://dust.tt/static/spiritavatar/filename"
        </span>
      </div>
      <div style={gridStyle}>
        {Object.entries(spiritAvatarUrlList).map(([filename, url]) => (
          <div key={filename} style={itemStyle as React.CSSProperties}>
            <Avatar visual={url} size="md" />
            <div className="s-overflow-hidden s-text-ellipsis s-text-xs s-text-foreground dark:s-text-foreground-night">
              {filename}
            </div>
          </div>
        ))}
      </div>
    </>
  ),
};
