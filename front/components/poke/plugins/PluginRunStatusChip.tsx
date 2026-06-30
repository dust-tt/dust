import { cn } from "@dust-tt/sparkle";
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
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

export function getStatusColorClasses(
  status: string,
  variant: "default" | "border" = "default"
) {
  const baseClasses = {
    success: "text-success-600 bg-success-50",
    error: "text-warning-600 bg-warning-50",
    pending: "text-info-600 bg-info-50",
    default: "text-primary-600 bg-primary-50",
  };

  const borderClasses = {
    success: "border-success-200",
    error: "border-warning-200",
    pending: "border-info-200",
    default: "border-primary-200",
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
