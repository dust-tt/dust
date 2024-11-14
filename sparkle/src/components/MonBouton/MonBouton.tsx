// src/components/MonBouton/MonBouton.tsx
import React from "react";
import { cn } from "@sparkle/lib/utils";

// Types de variantes
type ButtonVariant = "purple" | "blue" | "green";

interface MonBoutonProps {
  label: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  withRipple?: boolean;
}

export function MonBouton({
  label,
  onClick,
  className,
  disabled = false,
  variant = "purple",
  withRipple = true,
}: MonBoutonProps) {
  const variantStyles: Record<ButtonVariant, string> = {
    purple: [
      "s-bg-purple-500/10",
      "s-border-purple-500/20",
      "s-text-purple-700",
      "hover:s-bg-purple-500/20",
      "hover:s-border-purple-500/30",
      "hover:s-shadow-purple-500/30",
      "focus:s-ring-purple-500/40"
    ].join(" "),

    blue: [
      "s-bg-blue-500/10",
      "s-border-blue-500/20",
      "s-text-blue-700",
      "hover:s-bg-blue-500/20",
      "hover:s-border-blue-500/30",
      "hover:s-shadow-blue-500/30",
      "focus:s-ring-blue-500/40"
    ].join(" "),

    green: [
      "s-bg-emerald-400/10",
      "s-border-emerald-500/20",
      "s-text-emerald-700",
      "hover:s-bg-emerald-500/20",
      "hover:s-border-emerald-500/30",
      "hover:s-shadow-emerald-500/30",
      "focus:s-ring-emerald-500/40"
    ].join(" "),
  };

  return (
    <button
      className={cn(
        // Style de base
        "s-relative",
        "s-overflow-hidden",
        "s-border",
        "s-backdrop-blur-sm",
        "s-h-12",
        "s-px-6",
        "s-rounded-lg",
        "hover:s-shadow-lg",
        "s-transition-all",
        "s-duration-300",
        "focus:s-outline-none",
        "focus:s-ring-2",
        "focus:s-ring-offset-2",
        
        // Applique les styles de la variante
        variantStyles[variant],
        
        // Styles désactivés
        disabled && [
          "s-opacity-50",
          "s-cursor-not-allowed",
          "s-pointer-events-none",
          "s-grayscale"
        ],
        
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {/* Effet de ripple */}
      {withRipple && (
        <span className={cn(
          "s-absolute s-inset-0",
          "s-transform s-translate-y-full",
          "hover:s-translate-y-0",
          "s-transition-transform",
          "s-duration-300",
          "s-bg-gradient-to-t s-from-white/5 s-to-transparent"
        )} />
      )}
      
      <span className="s-relative s-z-10 s-font-medium">
        {label}
      </span>
    </button>
  );
}
