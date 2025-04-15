import type { RegisteredComponent } from "@builder.io/sdk-react";
import { Avatar, Button } from "@dust-tt/sparkle";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import { Heading, TAG_NAMES } from "@app/components/home/ContentComponents";
import { ScrollProgressText } from "@app/components/home/ScrollProgressText";

const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl", "xxl", "auto"] as const;

export const customComponents: RegisteredComponent[] = [
  {
    component: Button,
    name: "Button",
    inputs: [
      {
        name: "label",
        type: "text",
      },
      {
        name: "size",
        type: "enum",
        enum: [
          {
            value: "md",
            label: "md",
          },
          {
            value: "xl",
            label: "xl",
          },
        ],
      },
    ],
  },
  {
    component: Avatar,
    name: "Avatar",
    inputs: [
      {
        name: "size",
        type: "enum",
        enum: AVATAR_SIZES.map((size) => ({
          value: size,
          label: size,
        })),
        defaultValue: "md",
      },
      {
        name: "name",
        type: "text",
      },
      {
        name: "isRounded",
        type: "boolean",
        defaultValue: false,
      },
      {
        name: "backgroundColor",
        type: "text",
      },
    ],
  },
  {
    component: ScrollProgressText,
    name: "ScrollProgressText",
    inputs: [
      {
        name: "text",
        type: "text",
        defaultValue:
          "Like OS primitives for computers, Dust creates core building blocks for AI to connect your team’s knowledge and workflows.",
      },
      {
        name: "startColor",
        type: "text",
        defaultValue: "text-gray-300",
      },
      {
        name: "endColor",
        type: "text",
        defaultValue: "text-gray-900",
      },
      {
        name: "scrollDistance",
        type: "number",
        defaultValue: 600,
      },
    ],
  },
  {
    component: ImgBlock,
    name: "ImgBlock",
    noWrap: true,
    canHaveChildren: true,
    inputs: [
      {
        name: "title",
        type: "text",
        defaultValue: "Lorem Ipsum",
      },
      {
        name: "content",
        type: "text",
      },
      {
        name: "className",
        type: "text",
      },
    ],
  },
  {
    component: Heading,
    name: "Heading",
    // canHaveChildren: true,
    // defaultChildren: [
    //   {
    //     "@type": "@builder.io/sdk:Element",
    //     component: {
    //       name: "Text",
    //       options: {
    //         text: "Lorem ipsum",
    //       },
    //     },
    //   },
    // ],
    inputs: [
      {
        name: "children",
        type: "text",
        friendlyName: "Text",
        defaultValue: "Lorem ipsum",
      },
      {
        name: "level",
        type: "enum",
        enum: TAG_NAMES.map((tag) => ({
          value: tag,
          label: tag,
        })),
        defaultValue: "h1",
      },
      {
        name: "mono",
        type: "boolean",
      },
    ],
  },
];
