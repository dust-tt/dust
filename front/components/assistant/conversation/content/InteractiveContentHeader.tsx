import { Button, cn, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

interface InteractiveContentHeaderProps {
  children?: React.ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
}

export function InteractiveContentHeader({
  children,
  onClose,
  subtitle,
  title,
}: InteractiveContentHeaderProps) {
  return (
    <div
      className={cn(
        "bg-structure-0/60 flex border-border/70 backdrop-blur-sm dark:border-border-night/70",
        "items-center justify-between rounded-t-lg border-b px-4 py-2"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-primary">{title}</span>
        {subtitle && (
          <span className="text-element-700 text-xs">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          icon={XMarkIcon}
          className="text-element-600 hover:text-element-900"
        />
      </div>
    </div>
  );
}
