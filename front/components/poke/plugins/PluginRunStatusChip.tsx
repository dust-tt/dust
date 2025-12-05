import { cn } from "@dust-tt/sparkle";
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import React from "react";

interface PluginRunStatusChipProps {
  status: string;
  variant?: "default" | "large" | "border";
  className?: string;
}

export function getStatusIcon(status: string, size: "sm" | "md" | "lg" = "sm") {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const iconClass = sizeClasses[size];

  switch (status) {
    case "success":
      return <CheckCircle className={cn(iconClass, "text-green-500")} />;
    case "error":
      return <XCircle className={cn(iconClass, "text-red-500")} />;
    case "pending":
      return <Clock className={cn(iconClass, "text-yellow-500")} />;
    default:
      return <AlertCircle className={cn(iconClass, "text-gray-500")} />;
  }
}

function getStatusColorClasses(
  status: string,
  variant: "default" | "border" = "default"
) {
  const baseClasses = {
    success:
      "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20",
    error: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20",
    pending:
      "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20",
    default: "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20",
  };

  const borderClasses = {
    success: "border-green-200 dark:border-green-800",
    error: "border-red-200 dark:border-red-800",
    pending: "border-yellow-200 dark:border-yellow-800",
    default: "border-gray-200 dark:border-gray-800",
  };

  const statusKey = status as keyof typeof baseClasses;
  const base = baseClasses[statusKey] || baseClasses.default;

  if (variant === "border") {
    const border = borderClasses[statusKey] || borderClasses.default;
    return cn(base, border);
  }

  return base;
}

export function PluginRunStatusChip({
  status,
  variant = "default",
  className,
}: PluginRunStatusChipProps) {
  const iconSize = variant === "large" ? "md" : "sm";
  const chipClasses = cn(
    "inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium",
    variant === "large" && "px-3 text-sm",
    variant === "border" && "border",
    getStatusColorClasses(status, variant === "border" ? "border" : "default"),
    className
  );

  return (
    <span className={chipClasses}>
      {getStatusIcon(status, iconSize)}
      {status}
    </span>
  );
}
