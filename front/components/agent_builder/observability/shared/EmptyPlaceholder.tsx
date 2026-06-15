import { Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface EmptyPlaceholderProps {
  icon: ComponentType;
  title: string;
  description: string;
}

export function EmptyPlaceholder({
  icon,
  title,
  description,
}: EmptyPlaceholderProps) {
  return (
    <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
      <Icon
        visual={icon}
        size="lg"
 className="text-muted-foreground"
      />
      <div className="flex flex-col gap-2">
 <div className="text-base font-medium text-foreground">
          {title}
        </div>
 <div className="text-sm text-muted-foreground">
          {description}
        </div>
      </div>
    </div>
  );
}
