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
        "bg-structure-0/60 border-border/70 dark:border-border-night/70 flex items-center backdrop-blur-sm",
        "justify-between rounded-t-lg border-b px-4 py-2"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-element-900 text-sm font-medium">{title}</span>
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
