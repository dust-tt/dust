import React, { ComponentType } from "react";
import { Icon } from "./Icon";

interface IconProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}

export function PageHeader({ title, icon, description }: IconProps) {
  const iconClasses = "w-8 h-8 text-brand";
  const titleClasses = "text-2xl font-bold text-element-800 self-stretch";
  const descriptionClasses =
    "text-sm font-normal text-element-700 self-stretch";
  return (
    <div className="inline-flex shrink grow basis-0 flex-col items-start justify-start gap-1">
      <Icon IconComponent={icon} className={iconClasses} />
      <div className={titleClasses}>{title}</div>
      <div className={descriptionClasses}>{description}</div>
    </div>
  );
}
