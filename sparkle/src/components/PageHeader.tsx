import React, { ComponentType } from "react";

import { Icon } from "./Icon";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}

export function PageHeader({ title, icon, description }: PageHeaderProps) {
  const iconClasses = "s-w-8 s-h-8 s-text-brand";
  const titleClasses =
    "s-text-2xl s-font-bold s-text-element-800 s-self-stretch";
  const descriptionClasses =
    "s-text-sm s-font-normal s-text-element-700 s-self-stretch";

  return (
    <div className="s-inline-flex s-shrink s-grow s-basis-0 s-flex-col s-items-start s-justify-start s-gap-1">
      <Icon IconComponent={icon} className={iconClasses} />
      <div className={titleClasses}>{title}</div>
      <div className={descriptionClasses}>{description}</div>
    </div>
  );
}
