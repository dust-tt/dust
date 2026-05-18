import type { ComponentType, ReactNode } from "react";

type IconProps = {
  className?: string;
  "aria-hidden"?: boolean;
};

export function ProjectSettingsOptionLabel({
  icon: Icon,
  title,
  description,
  trailingInTitle,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
  trailingInTitle?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 text-foreground dark:text-foreground-night"
          aria-hidden
        />
        <span className="heading-sm text-foreground dark:text-foreground-night">
          {title}
        </span>
        {trailingInTitle}
      </div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {description}
      </div>
    </div>
  );
}
