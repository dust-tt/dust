import { getIcon } from "@app/components/resources/resources_icons";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/types/resources_icon_names";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/types/resources_icon_names";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ActionCardBlock, Avatar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { visit } from "unist-util-visit";

const DEFAULT_ICON: InternalAllowedIconType | CustomResourceIconType =
  "ActionRobotIcon";

/**
 * Remark plugin: transforms the `:::action_card{...attrs}` container directive
 * into a custom HTML element for React rendering.
 *
 * - `title`: short headline (required)
 * - `subtitle`: optional context line shown below the title
 * - `description`: one supporting sentence
 * - `icon`: name of icon shown
 * - `cta`: primary action button label
 * - `dismiss`: secondary action button label
 * - `actionMessage`: message sent to the agent when the primary action is taken (defaults to "Accept").
 * - `dismissMessage`: message sent to the agent when the secondary action is taken (defaults to "Dismiss").
 * - `collapsibleLabel`: label for the collapsible trigger.
 * - `collapsibleContent`: markdown rendered inside the collapsible section.
 */
export function actionCardDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name !== "action_card") {
        return;
      }
      node.data ??= {};
      const data = node.data;
      data.hName = "action_card";
      data.hProperties = { ...node.attributes };
    });
  };
}

type ActionCardStatus = "active" | "actioned" | "dismissed";

interface ActionCardProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  cta?: string;
  dismiss?: string;
  actionMessage?: string;
  dismissMessage?: string;
  collapsibleContent?: ReactNode;
  collapsibleLabel?: string;
  isLastMessage?: boolean;
  onSend?: (message: string) => Promise<void>;
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
  collapsibleContent,
  collapsibleLabel,
  isLastMessage = true,
  onSend,
}: ActionCardProps) {
  const applyLabel = cta ?? "Accept";
  const [status, setStatus] = useState<ActionCardStatus>("active");

  const resolvedIconName: InternalAllowedIconType | CustomResourceIconType =
    iconName !== undefined &&
    (isInternalAllowedIcon(iconName) || isCustomResourceIconType(iconName))
      ? iconName
      : DEFAULT_ICON;
  const icon = getIcon(resolvedIconName);
  const visual = useMemo(
    () => <Avatar icon={icon} backgroundColor="bg-highlight-100" />,
    [icon]
  );

  switch (status) {
    case "actioned":
      return (
        <ActionCardBlock
          title={title}
          applyLabel={applyLabel}
          acceptedTitle={title}
          visual={visual}
          state="accepted"
        />
      );
    case "dismissed":
      return (
        <ActionCardBlock
          title={title}
          applyLabel={applyLabel}
          rejectedTitle={title}
          visual={visual}
          state="rejected"
        />
      );
    case "active":
      return (
        <ActionCardBlock
          title={title}
          subtitle={subtitle}
          description={description}
          collapsibleContent={
            collapsibleContent ? (
              <div className="prose prose-sm">{collapsibleContent}</div>
            ) : undefined
          }
          collapsibleLabel={collapsibleContent ? collapsibleLabel : undefined}
          applyLabel={applyLabel}
          rejectLabel={dismiss ?? "Dismiss"}
          acceptedTitle={title}
          rejectedTitle={title}
          visual={visual}
          state={isLastMessage ? "active" : "disabled"}
          actionsPosition="header"
          onClickAccept={() => {
            setStatus("actioned");
            void onSend?.(actionMessage ?? "Accept");
          }}
          onClickReject={() => {
            setStatus("dismissed");
            void onSend?.(dismissMessage ?? "Dismiss");
          }}
        />
      );
    default:
      assertNeverAndIgnore(status);
      return null;
  }
}

interface ActionCardPluginProps {
  title?: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  cta?: string;
  dismiss?: string;
  actionMessage?: string;
  dismissMessage?: string;
  collapsibleLabel?: string;
  children?: ReactNode;
}

export function getActionCardPlugin(
  onSend: (message: string) => Promise<void>,
  isLastMessage = true
) {
  const ActionCardPlugin = ({
    title,
    subtitle,
    description,
    icon,
    cta,
    dismiss,
    actionMessage,
    dismissMessage,
    collapsibleLabel,
    children,
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
        actionMessage={actionMessage}
        dismissMessage={dismissMessage}
        collapsibleContent={children}
        collapsibleLabel={collapsibleLabel}
        isLastMessage={isLastMessage}
        onSend={onSend}
      />
    );
  };

  return ActionCardPlugin;
}
