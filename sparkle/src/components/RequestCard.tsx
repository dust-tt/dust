import React, { ComponentType, ReactNode } from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card } from "@sparkle/components/Card";
import { Checkbox } from "@sparkle/components/Checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import { cn } from "@sparkle/lib/utils";

interface RequestCardActionProps {
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export interface RequestCardProps {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  visual?: ReactNode;

  description?: string | ReactNode;

  details?: {
    trigger?: string;
    content: ReactNode;
    defaultOpen?: boolean;
  };

  checkbox?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    avatar?: {
      name?: string;
      visual?: string;
    };
  };

  primaryAction: RequestCardActionProps & {
    variant?: "highlight" | "warning";
  };

  secondaryAction?: RequestCardActionProps;

  className?: string;
}

export const RequestCard = React.forwardRef<HTMLDivElement, RequestCardProps>(
  (
    {
      title,
      icon,
      visual,
      description,
      details,
      checkbox,
      primaryAction,
      secondaryAction,
      className,
    },
    ref
  ) => {
    return (
      <Card ref={ref} variant="primary" size="md" className={className}>
        <div className="s-flex s-w-full s-flex-col s-gap-3">
          <div className="s-flex s-items-center s-gap-3">
            <Avatar
              size="sm"
              icon={icon}
              visual={visual}
              backgroundColor="s-bg-muted-background dark:s-bg-muted-background-night"
            />
            <span className="s-text-sm s-font-semibold">{title}</span>
          </div>

          {description && (
            <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {description}
            </div>
          )}

          {details && (
            <Collapsible defaultOpen={details.defaultOpen}>
              <CollapsibleTrigger
                label={details.trigger || "Details"}
                variant="secondary"
              />
              <CollapsibleContent>
                <div
                  className={cn(
                    "s-mt-2 s-rounded-lg s-p-3 s-text-sm",
                    "s-bg-muted-background dark:s-bg-muted-background-night"
                  )}
                >
                  {details.content}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {checkbox && (
            <label className="s-flex s-cursor-pointer s-items-center s-gap-2">
              <Checkbox
                checked={checkbox.checked}
                onCheckedChange={checkbox.onChange}
                size="xs"
              />
              <span
                className={cn(
                  "s-flex s-items-center s-gap-1.5 s-text-sm",
                  "s-text-muted-foreground dark:s-text-muted-foreground-night"
                )}
              >
                {checkbox.label}
                {checkbox.avatar && (
                  <>
                    <Avatar
                      size="xxs"
                      name={checkbox.avatar.name}
                      visual={checkbox.avatar.visual}
                      isRounded
                    />
                    {checkbox.avatar.name}
                  </>
                )}
              </span>
            </label>
          )}

          <div className="s-flex s-items-center s-justify-end s-gap-2">
            {secondaryAction && (
              <Button
                variant="outline"
                size="sm"
                label={secondaryAction.label}
                onClick={secondaryAction.onClick}
                isLoading={secondaryAction.isLoading}
                disabled={secondaryAction.disabled}
              />
            )}
            <Button
              variant={primaryAction.variant || "highlight"}
              size="sm"
              label={primaryAction.label}
              onClick={primaryAction.onClick}
              isLoading={primaryAction.isLoading}
              disabled={primaryAction.disabled}
            />
          </div>
        </div>
      </Card>
    );
  }
);

RequestCard.displayName = "RequestCard";
