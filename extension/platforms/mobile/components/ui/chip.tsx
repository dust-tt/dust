import { Text } from "@/components/ui/text";
import { colors } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Ionicons } from "@expo/vector-icons";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Platform, Pressable, View, type ViewProps } from "react-native";

/**
 * Chip component aligned with Sparkle design system
 *
 * Sizes:
 * - xs: Small chip (28px height)
 * - sm: Medium chip (36px height)
 *
 * Colors:
 * - primary: Neutral gray
 * - highlight: Blue (for selections/active states)
 * - success: Green
 * - warning: Golden/amber
 * - error: Rose/red
 */

const CHIP_SIZES = ["xs", "sm"] as const;
type ChipSize = (typeof CHIP_SIZES)[number];

const CHIP_COLORS = [
  "primary",
  "highlight",
  "success",
  "warning",
  "error",
] as const;
type ChipColor = (typeof CHIP_COLORS)[number];

const chipVariants = cva("flex-row items-center", {
  variants: {
    size: {
      xs: "min-h-7 rounded-lg px-3 gap-1",
      sm: "min-h-9 rounded-xl px-4 gap-1.5",
    },
    color: {
      primary: cn(
        "bg-gray-100 dark:bg-gray-800",
        "border border-gray-200 dark:border-gray-700"
      ),
      highlight: cn(
        "bg-blue-100 dark:bg-blue-900",
        "border border-blue-200 dark:border-blue-800"
      ),
      success: cn(
        "bg-green-100 dark:bg-green-900",
        "border border-green-200 dark:border-green-800"
      ),
      warning: cn(
        "bg-golden-100 dark:bg-golden-900",
        "border border-golden-200 dark:border-golden-800"
      ),
      error: cn(
        "bg-rose-100 dark:bg-rose-900",
        "border border-rose-200 dark:border-rose-800"
      ),
    },
    interactive: {
      true: Platform.select({
        web: "cursor-pointer transition-colors duration-200",
        default: "",
      }),
      false: "",
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
    interactive: false,
  },
});

const chipTextVariants = cva("font-medium", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
    },
    color: {
      primary: "text-gray-900 dark:text-gray-100",
      highlight: "text-blue-900 dark:text-blue-100",
      success: "text-green-900 dark:text-green-100",
      warning: "text-golden-900 dark:text-golden-100",
      error: "text-rose-900 dark:text-rose-100",
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

interface ChipProps extends Omit<ViewProps, "children"> {
  label: string;
  size?: ChipSize;
  color?: ChipColor;
  onPress?: () => void;
  onRemove?: () => void;
  className?: string;
}

function Chip({
  label,
  size = "xs",
  color = "primary",
  onPress,
  onRemove,
  className,
  ...props
}: ChipProps) {
  const isInteractive = !!onPress;

  const content = (
    <>
      <Text
        className={cn(chipTextVariants({ size, color }), "flex-shrink")}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onRemove && (
        <Pressable
          onPress={(e) => {
            onRemove();
          }}
          hitSlop={8}
          className="ml-0.5"
        >
          <Ionicons
            name="close"
            size={size === "xs" ? 14 : 16}
            color={
              color === "primary"
                ? colors.gray[600]
                : color === "highlight"
                  ? colors.blue[800]
                  : color === "success"
                    ? colors.green[700]
                    : color === "warning"
                      ? colors.golden[800]
                      : colors.rose[800]
            }
          />
        </Pressable>
      )}
    </>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        className={cn(
          chipVariants({ size, color, interactive: true }),
          "active:opacity-80",
          className
        )}
        {...props}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className={cn(chipVariants({ size, color, interactive: false }), className)}
      {...props}
    >
      {content}
    </View>
  );
}

/**
 * Badge component - smaller, non-interactive version of Chip
 * Used for status indicators and counts
 */

const badgeVariants = cva("items-center justify-center", {
  variants: {
    size: {
      xs: "min-h-5 rounded-md px-1.5 py-0.5",
      sm: "min-h-6 rounded-lg px-2 py-0.5",
    },
    color: {
      primary: "bg-gray-100 dark:bg-gray-800",
      highlight: "bg-blue-100 dark:bg-blue-900",
      success: "bg-green-100 dark:bg-green-900",
      warning: "bg-golden-100 dark:bg-golden-900",
      error: "bg-rose-100 dark:bg-rose-900",
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

const badgeTextVariants = cva("font-semibold", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-xs",
    },
    color: {
      primary: "text-gray-700 dark:text-gray-300",
      highlight: "text-blue-700 dark:text-blue-300",
      success: "text-green-700 dark:text-green-300",
      warning: "text-golden-700 dark:text-golden-300",
      error: "text-rose-700 dark:text-rose-300",
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

interface BadgeProps extends Omit<ViewProps, "children"> {
  label: string | number;
  size?: "xs" | "sm";
  color?: ChipColor;
  className?: string;
}

function Badge({
  label,
  size = "xs",
  color = "primary",
  className,
  ...props
}: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ size, color }), className)} {...props}>
      <Text className={cn(badgeTextVariants({ size, color }))}>
        {typeof label === "number" ? String(label) : label}
      </Text>
    </View>
  );
}

export {
  Badge,
  badgeTextVariants,
  badgeVariants,
  Chip,
  chipTextVariants,
  chipVariants,
};
export type { BadgeProps, ChipColor, ChipProps, ChipSize };
