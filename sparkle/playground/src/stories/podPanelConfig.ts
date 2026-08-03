import {
  MessageChatSquare,
  CheckCircle,
  Settings01,
  File02,
  Folder,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { FreeButtonSwitchContextMenuItem } from "../components/FreeButtonSwitch";
import {
  getConversationsBySpaceId,
  getMyPodConversations,
  MY_POD_SPACE,
  type Conversation,
  type Space,
} from "../data";

export type PodVariant = "personal" | "shared";

export type PodTabOption = {
  value: string;
  label?: string;
  icon?: ComponentType;
  tooltip?: string;
  pinned?: "end";
  removable?: boolean;
  contextMenuItems?: FreeButtonSwitchContextMenuItem[];
};

export type DynamicFileTab = {
  value: `file-${string}`;
  dataSourceId: string;
  label: string;
};

export type PodContext = {
  variant: PodVariant;
  space: Space;
  conversations: Conversation[];
  spaceId: string;
};

export function getFileTabValue(dataSourceId: string): `file-${string}` {
  return `file-${dataSourceId}`;
}

export function resolvePodContext(
  p2View: { kind: string; spaceId?: string },
  spaces: Space[],
  allConversations: Conversation[]
): PodContext | null {
  if (p2View.kind === "myPod") {
    return {
      variant: "personal",
      space: MY_POD_SPACE,
      conversations: getMyPodConversations(allConversations),
      spaceId: MY_POD_SPACE.id,
    };
  }

  if (p2View.kind === "space" && p2View.spaceId) {
    const space = spaces.find((s) => s.id === p2View.spaceId);
    if (!space) return null;

    return {
      variant: "shared",
      space,
      conversations: getConversationsBySpaceId(p2View.spaceId),
      spaceId: p2View.spaceId,
    };
  }

  return null;
}

export function getBasePodTabOptions(_variant: PodVariant): PodTabOption[] {
  return [
    {
      value: "conversations",
      label: "Conversations",
      icon: MessageChatSquare,
    },
    { value: "todos", label: "Tasks", icon: CheckCircle },
    { value: "knowledge", label: "Files", icon: Folder },
  ];
}

export function getDefaultMainTabOrder(variant: PodVariant): string[] {
  return getBasePodTabOptions(variant).map((option) => option.value);
}

export function buildPodTabOptions(
  variant: PodVariant,
  mainTabOrder: string[],
  dynamicFileTabs: DynamicFileTab[]
): PodTabOption[] {
  const baseByValue = new Map(
    getBasePodTabOptions(variant).map((option) => [option.value, option])
  );
  const dynamicByValue = new Map<string, PodTabOption>(
    dynamicFileTabs.map((tab) => [
      tab.value,
      {
        value: tab.value,
        label: tab.label,
        icon: File02,
        removable: true,
      },
    ])
  );

  const mainOptions = mainTabOrder
    .map((value) => baseByValue.get(value) ?? dynamicByValue.get(value))
    .filter((option): option is PodTabOption => option != null);

  if (variant === "shared") {
    return [
      ...mainOptions,
      {
        value: "settings",
        icon: Settings01,
        tooltip: "Pod settings",
        pinned: "end",
      },
    ];
  }

  return mainOptions;
}

export function getPodTabOptions(variant: PodVariant): PodTabOption[] {
  return buildPodTabOptions(variant, getDefaultMainTabOrder(variant), []);
}

export function shouldShowMemberChrome(variant: PodVariant): boolean {
  return variant === "shared";
}
