import { Text } from "@/components/ui/text";
import { colors } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import {
  Platform,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

/**
 * Input component aligned with Sparkle design system
 *
 * Features:
 * - Rounded-xl styling with muted background
 * - Error, disabled, and default states
 * - Optional label and helper message
 * - Message status: info, default, error
 */

const MESSAGE_STATUS = ["info", "default", "error"] as const;
type MessageStatus = (typeof MESSAGE_STATUS)[number];

const inputVariants = cva(
  cn(
    "flex h-9 w-full rounded-xl px-3 py-1.5 text-sm",
    "bg-muted dark:bg-gray-800",
    "border",
    "text-foreground dark:text-gray-50",
    Platform.select({
      web: "outline-none ring-inset transition-colors",
    })
  ),
  {
    variants: {
      state: {
        default: cn(
          "border-border dark:border-gray-700",
          Platform.select({
            web: "focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/30",
          })
        ),
        error: cn(
          "border-rose-400/60 dark:border-rose-500/60",
          Platform.select({
            web: "focus:border-rose-500 dark:focus:border-rose-400 focus:ring-2 focus:ring-rose-500/20 dark:focus:ring-rose-400/30",
          })
        ),
        disabled: cn(
          "border-border dark:border-gray-700",
          "opacity-50"
        ),
      },
    },
    defaultVariants: {
      state: "default",
    },
  }
);

const messageVariants = cva("text-xs mt-1", {
  variants: {
    status: {
      info: "text-muted-foreground",
      default: "text-muted-foreground",
      error: "text-rose-500 dark:text-rose-400",
    },
  },
  defaultVariants: {
    status: "info",
  },
});

interface InputProps extends Omit<TextInputProps, "editable"> {
  label?: string;
  message?: string | null;
  messageStatus?: MessageStatus;
  isError?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}

const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      label,
      message,
      messageStatus = "info",
      isError = false,
      disabled = false,
      className,
      inputClassName,
      placeholderTextColor,
      ...props
    },
    ref
  ) => {
    const state = isError || messageStatus === "error"
      ? "error"
      : disabled
        ? "disabled"
        : "default";

    return (
      <View className={cn("flex flex-col gap-1", className)}>
        {label && (
          <Text variant="label-sm" className="mb-1">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          editable={!disabled}
          className={cn(inputVariants({ state }), inputClassName)}
          placeholderTextColor={placeholderTextColor || colors.gray[500]}
          {...props}
        />
        {message && (
          <Text className={cn(messageVariants({ status: messageStatus }))}>
            {message}
          </Text>
        )}
      </View>
    );
  }
);

Input.displayName = "Input";

export { Input, inputVariants, messageVariants };
export type { InputProps, MessageStatus };
