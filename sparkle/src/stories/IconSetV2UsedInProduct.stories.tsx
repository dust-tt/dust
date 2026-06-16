import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import * as StrokeIcons from "@sparkle/icons/v2-stroke";

import { Icon } from "../index_with_tw_base";

const meta = {
  title: "Assets/Icons/Used in Product",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `The curated subset of v2 stroke icons actually used across the Dust product. Treat this as the recommended palette to keep the product's iconography consistent; reach for the full **All Icons** catalog only when nothing here fits.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ICONS_USED_IN_PRODUCT = [
  "ActionFrame",
  "ActionStore",
  "AlertCircle",
  "Archive",
  "ArrowCircleBrokenRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Attachment01",
  "Bank",
  "BarChart01",
  "Beaker02",
  "Bell01",
  "Bold01",
  "BookOpen01",
  "Brackets",
  "Brain",
  "Building04",
  "Calendar",
  "Camera01",
  "CheckCircle",
  "CheckDone01",
  "Check",
  "ChevronDown",
  "ChevronLeft",
  "ChevronRight",
  "ChevronUp",
  "Circle",
  "ClipboardCheck",
  "Clipboard",
  "ClockRewind",
  "Clock",
  "CloudArrowLeftRight",
  "Code01",
  "CodeSquare01",
  "CoinsStacked03",
  "Command",
  "ContactsRobot",
  "CreditCard01",
  "Cube01",
  "CubeOutline",
  "Dot",
  "DotsHorizontal",
  "DoubleQuotes",
  "Download01",
  "Edit04",
  "EyeOff",
  "Eye",
  "FaceSmile",
  "File02",
  "File04",
  "File06",
  "FilePlus03",
  "Fire",
  "FolderOpen",
  "FolderTable",
  "Folder",
  "GitBranch01",
  "Globe01",
  "Hash01",
  "Heading01",
  "Heart",
  "Hexagon01",
  "Image01",
  "InfoCircle",
  "IntersectDust",
  "Italic01",
  "LayersThree01",
  "LayoutRight",
  "Lightbulb04",
  "Link01",
  "LinkExternal01",
  "ListAdd",
  "ListSelect",
  "List",
  "Lock01",
  "LogIn01",
  "LogOut01",
  "MagicWand02",
  "Mail01",
  "Mail02",
  "MarkerPin01",
  "Maximize01",
  "MedicalCross",
  "Menu01",
  "MessageChatSquare",
  "MessageCircle01",
  "MessageDotsCircle",
  "MessagePlusCircle",
  "Microphone01",
  "Minimize01",
  "Minus",
  "Moon01",
  "Paint",
  "PieChart01",
  "Pin02",
  "Planet",
  "Play",
  "PlusCircle",
  "Plus",
  "PresentationChart01",
  "PuzzlePiece01",
  "RefreshCw01",
  "RefreshCw02",
  "ReverseLeft",
  "Robot",
  "Rocket02",
  "Scan",
  "SearchMd",
  "SeatMax",
  "Server03",
  "Settings01",
  "ShapesPlus",
  "Shapes",
  "ShoppingBag01",
  "Sidekick",
  "SpaceClosed",
  "SpaceOpen",
  "Square",
  "Star01",
  "Stars02",
  "Stop",
  "Sun",
  "Table",
  "Tag01",
  "TagBlock",
  "Terminal",
  "ThumbsDown",
  "ThumbsUp",
  "Trash01",
  "Trash04",
  "Triangle",
  "Type01",
  "Upload01",
  "UploadCloud02",
  "User01",
  "UserSquare",
  "Users01",
  "VolumeMax",
  "XCircle",
  "XClose",
  "ZapOff",
  "Zap",
] as const;

const isIconComponent = (
  v: unknown
): v is React.ComponentType<{ className?: string }> => typeof v === "function";

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "48px 16px",
};

const itemStyle: React.CSSProperties = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

export const IconsUsedInProduct: Story = {
  render: () => (
    <div style={gridStyle}>
      {ICONS_USED_IN_PRODUCT.map((iconName) => {
        const IconComponent = StrokeIcons[iconName as keyof typeof StrokeIcons];
        if (!isIconComponent(IconComponent)) {
          return null;
        }
        return (
          <div key={iconName}>
            <Icon
              visual={IconComponent}
              size="md"
              className="s-text-foreground dark:s-text-foreground-night"
            />
            <div
              style={itemStyle}
              className="s-text-sm s-text-foreground dark:s-text-foreground-night"
            >
              {iconName}
            </div>
          </div>
        );
      })}
    </div>
  ),
};
