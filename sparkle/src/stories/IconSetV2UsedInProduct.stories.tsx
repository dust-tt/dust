import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import * as StrokeIcons from "@sparkle/icons/v2-stroke";

import { Icon } from "../index_with_tw_base";

const meta = {
  title: "Assets/Icons/Used in Product",
  tags: ["!manifest", "autodocs"],
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
  "Announcement01",
  "Archive",
  "ArrowCircleBrokenRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowNarrowDownRight",
  "ArrowNarrowUpRight",
  "ArrowRight",
  "ArrowUp",
  "ArrowUpRight",
  "Atom01",
  "Attachment01",
  "Bank",
  "BarChart01",
  "BarFull",
  "BarHalf",
  "BarLineChart",
  "BarLow",
  "Beaker02",
  "Bell01",
  "Bold01",
  "BookOpen01",
  "Brackets",
  "Brain",
  "Building01",
  "Building04",
  "Calendar",
  "Camera01",
  "Check",
  "CheckCircle",
  "CheckDone01",
  "CheckDouble",
  "ChevronDown",
  "ChevronLeft",
  "ChevronRight",
  "ChevronSelectorVertical",
  "ChevronUp",
  "Circle",
  "Clipboard",
  "ClipboardCheck",
  "Clock",
  "ClockRewind",
  "CloudArrowLeftRight",
  "Code01",
  "CodeBrowser",
  "CodeSquare01",
  "CoinsStacked01",
  "CoinsStacked03",
  "Command",
  "ContactsRobot",
  "CpuChip01",
  "CreditCard01",
  "Cube01",
  "CubeOutline",
  "Database01",
  "Dataflow01",
  "Dot",
  "DotsHorizontal",
  "DoubleQuotes",
  "Download01",
  "Edit04",
  "Eye",
  "EyeOff",
  "FaceSmile",
  "File02",
  "File04",
  "File06",
  "FilePlus03",
  "FilterFunnel01",
  "Fingerprint04",
  "Fire",
  "Folder",
  "FolderOpen",
  "FolderTable",
  "GitBranch01",
  "Globe01",
  "Hash01",
  "Heading01",
  "Heart",
  "Hexagon01",
  "Image01",
  "InfoCircle",
  "InfoSquare",
  "IntersectDust",
  "Italic01",
  "Key01",
  "LayerSingle",
  "LayersThree01",
  "LayersTwo01",
  "LayoutAlt02",
  "LayoutLeft",
  "LayoutRight",
  "Lightbulb01",
  "Lightbulb04",
  "Link01",
  "LinkExternal01",
  "List",
  "ListSelect",
  "Lock01",
  "LogIn01",
  "LogOut01",
  "MagicWand02",
  "Mail01",
  "MarkerPin01",
  "Maximize01",
  "MedicalCross",
  "Menu01",
  "MessageChatCircle",
  "MessageChatSquare",
  "MessageCircle01",
  "MessageDotsCircle",
  "MessagePlusCircle",
  "MessageSmileCircle",
  "MessageTextCircle01",
  "Microphone01",
  "Minimize01",
  "Minus",
  "Monitor01",
  "Moon01",
  "Paint",
  "Palette",
  "Paperclip",
  "PauseCircle",
  "Pencil01",
  "PieChart01",
  "Pin02",
  "Planet",
  "Play",
  "Plus",
  "PlusCircle",
  "PresentationChart01",
  "PuzzlePiece01",
  "RefreshCw01",
  "RefreshCw02",
  "ReverseLeft",
  "Robot",
  "Rocket02",
  "Scan",
  "SearchLg",
  "SearchMd",
  "Server03",
  "Settings01",
  "Settings02",
  "Shapes",
  "ShapesPlus",
  "ShieldTick",
  "ShoppingBag01",
  "Sidekick",
  "SlashCircle01",
  "SpaceClosed",
  "Square",
  "Star01",
  "StarFilled",
  "Stars02",
  "Stop",
  "Sun",
  "Table",
  "Tag01",
  "TagBlock",
  "Target01",
  "Terminal",
  "TerminalSquare",
  "ThumbsDown",
  "ThumbsUp",
  "Toggle01Left",
  "Trash01",
  "Trash04",
  "Triangle",
  "Type01",
  "Upload01",
  "UploadCloud02",
  "User01",
  "UserSquare",
  "Users01",
  "UsersCheck",
  "UsersPlus",
  "VolumeMax",
  "X",
  "XCircle",
  "XClose",
  "Zap",
  "ZapOff",
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
              className="text-foreground"
            />
            <div style={itemStyle} className="text-sm text-foreground">
              {iconName}
            </div>
          </div>
        );
      })}
    </div>
  ),
};
