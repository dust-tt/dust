import { Avatar, Button, ListItem, User01, XClose } from "@dust-tt/sparkle";
import type { ComponentProps, ReactNode } from "react";

interface FrameSharingRowProps {
  label: string;
  icon?: ComponentProps<typeof Avatar>["icon"];
  children: ReactNode;
  onRemove?: () => void;
  isRemoving?: boolean;
}

export function FrameSharingRow({
  label,
  icon = User01,
  children,
  onRemove,
  isRemoving = false,
}: FrameSharingRowProps) {
  return (
    <ListItem
      className="gap-2 px-3 py-2"
      itemsAlignment="center"
      hasSeparator={false}
    >
      <div aria-hidden="true" className="shrink-0">
        <Avatar
          size="sm"
          name={label}
          icon={icon}
          backgroundColor="bg-brand-support-blue"
          iconColor="text-brand-electric-blue"
          isRounded
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="whitespace-normal break-all text-sm font-medium text-foreground">
          {label}
        </span>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {children}
        </div>
      </div>
      {(onRemove || isRemoving) && (
        <Button
          variant="ghost"
          icon={XClose}
          tooltip={`Remove ${label}`}
          size="xs"
          onClick={onRemove}
          isLoading={isRemoving}
        />
      )}
    </ListItem>
  );
}
