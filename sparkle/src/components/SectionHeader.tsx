import React from "react";

import { Button, ButtonProps } from "./Button";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ButtonProps;
}

export function SectionHeader({
  title,
  description,
  action,
}: SectionHeaderProps) {
  const titleClasses =
    "s-text-lg s-font-bold s-text-element-900 s-self-stretch";
  const descriptionClasses =
    "s-text-sm s-font-normal s-text-element-900 s-self-stretch";

  return (
    <div className="s-mt-8 s-flex s-shrink s-grow s-basis-0 s-flex-col s-items-stretch s-justify-between s-gap-2 md:s-flex-row md:s-items-center">
      <div className="s-flex s-flex-col s-gap-1">
        <div className={titleClasses}>{title}</div>
        <div className={descriptionClasses}>{description}</div>
      </div>
      {action && (
        <div className="s-flex">
          <Button {...action} />
        </div>
      )}
    </div>
  );
}
