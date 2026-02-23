import React from "react";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { Avatar } from "@dust-tt/sparkle/components/Avatar";
import {
  CardVariantType,
  CARD_VARIANTS,
} from "@dust-tt/sparkle/components/Card";
import * as PlatformLogos from "@dust-tt/sparkle/logo/platforms";

const ACTION_CARD_STATES = [
  "active",
  "disabled",
  "accepted",
  "rejected",
] as const;

type ActionCardState = (typeof ACTION_CARD_STATES)[number];

function getStringAttribute(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolvePlatformLogo(
  name: string
): React.ComponentType<{ className?: string }> | undefined {
  if (Object.prototype.hasOwnProperty.call(PlatformLogos, name)) {
    return PlatformLogos[name as keyof typeof PlatformLogos];
  }
  return undefined;
}

function parseListAttribute(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAttributeValue(
  attributes: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      return attributes[key];
    }
  }
  return undefined;
}

function parseBooleanAttribute(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function buildAvatarVisual(attributes: Record<string, unknown>): {
  visual?: React.ReactNode;
} {
  const avatarIconName = getStringAttribute(attributes.avatarIcon);
  const avatarEmoji = getStringAttribute(attributes.avatarEmoji);
  const avatarVisual =
    getStringAttribute(attributes.avatarVisual) ??
    getStringAttribute(attributes.visual);
  const avatarName = getStringAttribute(attributes.avatarName);
  const backgroundColor = getStringAttribute(attributes.avatarBackgroundColor);
  const hexBgColor = getStringAttribute(attributes.avatarHexBgColor);
  const iconColor = getStringAttribute(attributes.avatarIconColor);
  const iconComponent = avatarIconName
    ? resolvePlatformLogo(avatarIconName)
    : undefined;

  if (!iconComponent && !avatarEmoji && !avatarVisual && !avatarName) {
    return {};
  }

  return {
    visual: (
      <Avatar
        size="sm"
        icon={iconComponent}
        emoji={avatarEmoji}
        visual={avatarVisual}
        name={avatarName}
        backgroundColor={backgroundColor}
        hexBgColor={hexBgColor}
        iconColor={iconColor}
      />
    ),
  };
}

function buildAvatarStackFromProps(props: {
  avatarNames?: string;
  avatarEmojis?: string;
  avatarVisuals?: string;
  avatarHexBgColors?: string;
  avatarBackgroundColors?: string;
  avatarIconNames?: string;
  avatarIsRounded?: boolean;
}) {
  const avatarNames = parseListAttribute(props.avatarNames);
  const avatarEmojis = parseListAttribute(props.avatarEmojis);
  const avatarVisuals = parseListAttribute(props.avatarVisuals);
  const avatarHexBgColors = parseListAttribute(props.avatarHexBgColors);
  const avatarBackgroundColors = parseListAttribute(
    props.avatarBackgroundColors
  );
  const avatarIconNames = parseListAttribute(props.avatarIconNames);

  return avatarNames.map((name, index) => ({
    name,
    emoji: avatarEmojis[index],
    visual: avatarVisuals[index],
    hexBgColor: avatarHexBgColors[index],
    backgroundColor: avatarBackgroundColors[index],
    icon: avatarIconNames[index]
      ? resolvePlatformLogo(avatarIconNames[index])
      : undefined,
    isRounded: props.avatarIsRounded,
  }));
}

function getPlainText(node: Node): string {
  const nodeWithValue = node as { value?: unknown };
  if (typeof nodeWithValue.value === "string") {
    return nodeWithValue.value;
  }
  const nodeWithChildren = node as { children?: Node[] };
  if (Array.isArray(nodeWithChildren.children)) {
    return nodeWithChildren.children.map(getPlainText).join("");
  }
  return "";
}

function getPlainTextFromChildren(node: Node): string {
  const nodeWithChildren = node as { children?: Node[] };
  if (!Array.isArray(nodeWithChildren.children)) {
    return "";
  }
  return nodeWithChildren.children.map(getPlainText).join("").trim();
}

function resolveCardVariant(attributes: Record<string, unknown>) {
  const variant = getStringAttribute(attributes.cardVariant);
  if (!variant) {
    return undefined;
  }
  return CARD_VARIANTS.includes(variant as CardVariantType)
    ? (variant as CardVariantType)
    : undefined;
}

function resolveCardState(attributes: Record<string, unknown>) {
  const state = getStringAttribute(attributes.state);
  if (!state) {
    return undefined;
  }
  return ACTION_CARD_STATES.includes(state as ActionCardState)
    ? (state as ActionCardState)
    : undefined;
}

function hasAttribute(
  attributes: Record<string, unknown>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(attributes, key);
}

type ActionCardData = {
  hName?: string;
  hProperties?: Record<string, unknown>;
};

type ActionCardDirectiveNode = Node & {
  type: "containerDirective";
  name?: string;
  data?: ActionCardData;
  attributes?: Record<string, unknown>;
};

export function actionCardDirective() {
  return (tree: Node) => {
    visit(tree, "containerDirective", (node) => {
      const directiveNode = node as ActionCardDirectiveNode;
      if (directiveNode.name === "action_card") {
        const attributes = (directiveNode.attributes ?? {}) as Record<
          string,
          unknown
        >;
        const title = getStringAttribute(attributes.title);
        const description = getPlainTextFromChildren(directiveNode);
        const avatars = buildAvatarStackFromProps({
          avatarNames: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarNames",
              "avatar-names",
              "avatar_names",
              "avatarnames",
            ])
          ),
          avatarEmojis: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarEmojis",
              "avatar-emojis",
              "avatar_emojis",
              "avataremojis",
            ])
          ),
          avatarVisuals: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarVisuals",
              "avatar-visuals",
              "avatar_visuals",
              "avatarvisuals",
            ])
          ),
          avatarHexBgColors: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarHexBgColors",
              "avatar-hex-bg-colors",
              "avatar_hex_bg_colors",
              "avatarhexbgcolors",
            ])
          ),
          avatarBackgroundColors: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarBackgroundColors",
              "avatar-background-colors",
              "avatar_background_colors",
              "avatarbackgroundcolors",
            ])
          ),
          avatarIconNames: getStringAttribute(
            getAttributeValue(attributes, [
              "avatarIconNames",
              "avatar-icon-names",
              "avatar_icon_names",
              "avatariconnames",
            ])
          ),
          avatarIsRounded: parseBooleanAttribute(
            getAttributeValue(attributes, [
              "avatarIsRounded",
              "avatar-is-rounded",
              "avatar_is_rounded",
              "avatarisrounded",
            ])
          ),
        });
        const { visual } = buildAvatarVisual(attributes);
        const resolvedVisual =
          avatars.length > 0 ? (
            <Avatar.Stack avatars={avatars} size="sm" nbVisibleItems={4} />
          ) : (
            visual
          );
        const data = directiveNode.data ?? (directiveNode.data = {});
        data.hName = "action_card";
        data.hProperties = {
          title,
          visual: resolvedVisual,
          hasCheck: parseBooleanAttribute(
            getAttributeValue(attributes, [
              "hasCheck",
              "has-check",
              "has_check",
              "hascheck",
            ])
          ),
          checkLabel: getStringAttribute(
            getAttributeValue(attributes, [
              "checkLabel",
              "check-label",
              "check_label",
              "checklabel",
            ])
          ),
          description: description.length > 0 ? description : undefined,
          applyLabel: getStringAttribute(attributes.applyLabel),
          rejectLabel: getStringAttribute(attributes.rejectLabel),
          acceptedTitle: getStringAttribute(attributes.acceptedTitle),
          rejectedTitle: getStringAttribute(attributes.rejectedTitle),
          cardVariant: resolveCardVariant(attributes),
          state: resolveCardState(attributes),
          applyOnClick: hasAttribute(attributes, "applyOnClick"),
          rejectOnClick: hasAttribute(attributes, "rejectOnClick"),
        };
      }
    });
  };
}
