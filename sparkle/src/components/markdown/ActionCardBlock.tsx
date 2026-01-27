import React from "react";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card, CARD_VARIANTS, CardVariantType } from "@sparkle/components/Card";
import * as PlatformLogos from "@sparkle/logo/platforms";

const DEFAULT_APPLY_LABEL = "Apply";
const DEFAULT_REJECT_LABEL = "Reject";

interface ActionCardBlockProps {
  title?: string;
  visual?: React.ReactNode;
  description?: string;
  applyLabel?: string;
  rejectLabel?: string;
  cardVariant?: CardVariantType;
  children?: React.ReactNode;
}

function getStringAttribute(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolvePlatformLogo(
  name: string
): React.ComponentType<{ className?: string }> | null {
  if (Object.prototype.hasOwnProperty.call(PlatformLogos, name)) {
    return PlatformLogos[name as keyof typeof PlatformLogos];
  }
  return null;
}

function buildAvatarVisual(
  attributes: Record<string, unknown>
): React.ReactNode | undefined {
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
    : null;

  if (!iconComponent && !avatarEmoji && !avatarVisual && !avatarName) {
    return undefined;
  }

  return (
    <Avatar
      size="sm"
      icon={iconComponent ?? undefined}
      emoji={avatarEmoji}
      visual={avatarVisual}
      name={avatarName}
      backgroundColor={backgroundColor}
      hexBgColor={hexBgColor}
      iconColor={iconColor}
    />
  );
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

export function ActionCardBlock({
  title,
  visual,
  description,
  applyLabel,
  rejectLabel,
  cardVariant,
  children,
}: ActionCardBlockProps) {
  const resolvedDescription = description ?? "";
  const applyVariant = cardVariant === "warning" ? "warning" : "primary";

  return (
    <Card
      variant={"primary"}
      size="sm"
      className="s-my-2 s-flex s-max-w-md s-flex-col s-gap-3"
    >
      {(visual || title) && (
        <div className="s-flex s-h-8 s-items-center s-gap-2">
          {visual && visual}
          {title && (
            <div className="s-heading-base s-text-foreground dark:s-text-foreground-night">
              {title}
            </div>
          )}
        </div>
      )}
      {resolvedDescription.length > 0 ? (
        <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
          {resolvedDescription}
        </div>
      ) : (
        children
      )}
      <div className="s-flex s-flex-wrap s-justify-between s-gap-2">
        <Button
          variant="outline"
          size="sm"
          label={rejectLabel ?? DEFAULT_REJECT_LABEL}
          disabled
        />
        <Button
          variant={applyVariant}
          size="sm"
          label={applyLabel ?? DEFAULT_APPLY_LABEL}
          disabled
        />
      </div>
    </Card>
  );
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
        const visual = buildAvatarVisual(attributes);
        const data = directiveNode.data ?? (directiveNode.data = {});
        const description = getPlainTextFromChildren(directiveNode);
        data.hName = "action_card";
        data.hProperties = {
          title: getStringAttribute(attributes.title),
          visual,
          description: description.length > 0 ? description : undefined,
          applyLabel: getStringAttribute(attributes.applyLabel),
          rejectLabel: getStringAttribute(attributes.rejectLabel),
          cardVariant: resolveCardVariant(attributes),
        };
      }
    });
  };
}
