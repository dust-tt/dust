import React, { useState } from "react";

import { Button, PlayIcon } from "@sparkle/_index";
import { Avatar } from "@sparkle/components/Avatar";
import { classNames } from "@sparkle/lib/utils";

type AssistantPreviewVariant = "item" | "list" | "gallery";

interface AssistantPreviewProps {
  variant: AssistantPreviewVariant;
  description: string;
  title: string;
  pictureUrl: string;
  actions?: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
}

const titleClassNames = {
  base: "s-truncate s-font-medium s-text-element-900 s-w-full",
  item: "s-text-sm",
  list: "s-text-base",
  gallery: "s-text-lg",
};
const subtitleClassNames = {
  base: "s-font-normal s-text-element-700 s-truncate s-w-full",
  item: "s-text-xs",
  list: "s-text-sm",
  gallery: "s-text-sm",
};
const descriptionClassNames = {
  base: "s-font-normal s-mb-1",
  item: "s-text-xs s-text-element-700  s-pl-1",
  list: "s-text-base s-text-element-800",
  gallery: "s-text-base s-text-element-800",
};

export function AssistantPreview2({
  variant,
  title,
  subtitle,
  pictureUrl,
  description,
  actions,
  onClick,
}: AssistantPreviewProps) {
  // State to manage the visibility of the play button
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      className={classNames(
        "s-flex s-flex-col s-gap-2 s-border s-border-structure-100/0 s-transition s-duration-200 hover:s-cursor-pointer hover:s-border-structure-100 hover:s-bg-structure-50",
        variant === "item" ? "s-rounded-2xl s-p-3" : " s-rounded-3xl s-p-4"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="s-flex s-gap-2">
        <Avatar
          visual={<img src={pictureUrl} alt={`Avatar of ${title}`} />}
          size={variant === "item" ? "sm" : "md"}
        />
        <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-2">
          <div className="s-flex s-w-full s-min-w-0 s-flex-row s-gap-3">
            <div className="s-flex s-w-full s-min-w-0 s-flex-col s-items-start s-gap-0">
              <div
                className={classNames(
                  titleClassNames["base"],
                  titleClassNames[variant]
                )}
              >
                @{title}
              </div>
              {variant !== "item" && (
                <div
                  className={classNames(
                    subtitleClassNames["base"],
                    subtitleClassNames[variant]
                  )}
                >
                  By: {subtitle}
                </div>
              )}
              {variant === "item" && <div className="s-pt-1">{actions}</div>}
            </div>
            {variant === "gallery" &&
              isHovered && ( // Conditional rendering based on isHovered
                <Button
                  variant="primary"
                  size="sm"
                  label="Try"
                  labelVisible={false}
                  icon={PlayIcon}
                />
              )}
          </div>
          {variant !== "item" && (
            <>
              {actions}
              <div
                className={classNames(
                  descriptionClassNames["base"],
                  descriptionClassNames[variant]
                )}
              >
                {description}
              </div>
            </>
          )}
        </div>
      </div>
      {variant === "item" && (
        <div
          className={classNames(
            descriptionClassNames["base"],
            descriptionClassNames[variant]
          )}
        >
          {description}
        </div>
      )}
    </div>
  );
}
