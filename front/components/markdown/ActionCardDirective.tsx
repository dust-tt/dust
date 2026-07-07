import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icon_names";
import { getIcon } from "@app/components/resources/resources_icons";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";
import { useState } from "react";
import { visit } from "unist-util-visit";

const DEFAULT_ICON: InternalAllowedIconType | CustomResourceIconType =
  "ActionRobotIcon";

/**
 * Remark plugin: transforms `::action_card[title]{...attrs}` into a custom
 * HTML element for React rendering.
 *
 * - `[title]`: short headline
 * - `subtitle`: optional context line shown below the title
 * - `description`: one supporting sentence
 * - `icon`: name of icon shown
 * - `cta`: primary action button label.
 * - `dismiss`: secondary action button label.
 * - `actionMessage`: message sent to the agent when the primary action is taken (defaults to "Accept").
 * - `dismissMessage`: message sent to the agent when the secondary action is taken (defaults to "Dismiss").
 */
export function actionCardDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name !== "action_card") {
        return;
      }
      node.data ??= {};
      const data = node.data;
      const title = node.children?.[0]?.value ?? "";
      data.hName = "action_card";
      data.hProperties = { title, ...node.attributes };
    });
  };
}

type ActionCardStatus = "active" | "actioned" | "dismissed";

export interface ActionCardCallbacks {
  onAction?: (message: string) => Promise<void>;
  onDismiss?: (message: string) => Promise<void>;
}

interface ActionCardProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  cta?: string;
  dismiss?: string;
  actionMessage?: string;
  dismissMessage?: string;
  isLastMessage?: boolean;
  onAction?: (message: string) => Promise<void>;
  onDismiss?: (message: string) => Promise<void>;
}

function ActionCard({
  title,
  subtitle,
  description,
  icon: iconName,
  cta,
  dismiss,
  actionMessage,
  dismissMessage,
  isLastMessage = true,
  onAction,
  onDismiss,
}: ActionCardProps) {
  const applyLabel = cta ?? "Accept";
  const [status, setStatus] = useState<ActionCardStatus>("active");

  const resolvedIconName: InternalAllowedIconType | CustomResourceIconType =
    iconName !== undefined &&
    (isInternalAllowedIcon(iconName) || isCustomResourceIconType(iconName))
      ? iconName
      : DEFAULT_ICON;
  const icon = getIcon(resolvedIconName);

  if (status === "actioned") {
    return (
      <ActionCardBlock
        title={title}
        applyLabel={applyLabel}
        acceptedTitle={title}
        visual={<Avatar icon={icon} backgroundColor="bg-highlight-100" />}
        state="accepted"
      />
    );
  }

  if (status === "dismissed") {
    return (
      <ActionCardBlock
        title={title}
        applyLabel={applyLabel}
        rejectedTitle={title}
        visual={<Avatar icon={icon} backgroundColor="bg-highlight-100" />}
        state="rejected"
      />
    );
  }

  return (
    <ActionCardBlock
      title={title}
      subtitle={subtitle}
      description={description}
      applyLabel={applyLabel}
      rejectLabel={dismiss ?? "Dismiss"}
      acceptedTitle={title}
      rejectedTitle={title}
      visual={<Avatar icon={icon} backgroundColor="bg-highlight-100" />}
      state={isLastMessage ? "active" : "disabled"}
      actionsPosition="header"
      onClickAccept={() => {
        setStatus("actioned");
        void onAction?.(actionMessage ?? "Accept");
      }}
      onClickReject={() => {
        setStatus("dismissed");
        void onDismiss?.(dismissMessage ?? "Dismiss");
      }}
    />
  );
}

interface ActionCardPluginProps {
  title?: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  cta?: string;
  dismiss?: string;
  actionmessage?: string;
  dismissmessage?: string;
}

export function getActionCardPlugin(
  callbacks: ActionCardCallbacks = {},
  isLastMessage = true
) {
  const ActionCardPlugin = ({
    title,
    subtitle,
    description,
    icon,
    cta,
    dismiss,
    actionmessage,
    dismissmessage,
  }: ActionCardPluginProps) => {
    if (!title) {
      return null;
    }
    return (
      <ActionCard
        title={title}
        subtitle={subtitle}
        description={description}
        icon={icon}
        cta={cta}
        dismiss={dismiss}
        actionMessage={actionmessage}
        dismissMessage={dismissmessage}
        isLastMessage={isLastMessage}
        onAction={callbacks.onAction}
        onDismiss={callbacks.onDismiss}
      />
    );
  };

  return ActionCardPlugin;
}
