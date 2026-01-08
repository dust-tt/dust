import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import * as AvatarPrimitive from "@rn-primitives/avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable, View } from "react-native";

/**
 * Avatar component aligned with Sparkle design system
 *
 * Sizes:
 * - xs: 24px (6)
 * - sm: 32px (8)
 * - md: 40px (10) - default
 * - lg: 64px (16)
 * - xl: 80px (20)
 * - 2xl: 144px (36)
 *
 * Variants:
 * - default: Static avatar
 * - clickable: Interactive with hover/press states
 * - disabled: Reduced opacity
 */

const AVATAR_COLORS = [
  "bg-blue-300",
  "bg-violet-300",
  "bg-rose-300",
  "bg-golden-300",
  "bg-green-300",
] as const;

const AVATAR_TEXT_COLORS = [
  "text-blue-700",
  "text-violet-700",
  "text-rose-700",
  "text-golden-700",
  "text-green-700",
] as const;

function getColorFromName(name: string): {
  bg: string;
  text: string;
} {
  if (/\+/.test(name)) {
    return { bg: "bg-gray-300", text: "text-muted-foreground" };
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return {
    bg: AVATAR_COLORS[index],
    text: AVATAR_TEXT_COLORS[index],
  };
}

const avatarVariants = cva(
  "flex shrink-0 items-center justify-center overflow-hidden",
  {
    variants: {
      size: {
        xs: "size-6",
        sm: "size-8",
        md: "size-10",
        lg: "size-16",
        xl: "size-20",
        "2xl": "size-36",
      },
      variant: {
        default: "",
        clickable: Platform.select({
          web: "cursor-pointer transition duration-200 hover:brightness-110 active:brightness-90",
          default: "active:opacity-80",
        }),
        disabled: "opacity-50",
      },
      rounded: {
        true: "rounded-full",
        false: "",
      },
    },
    compoundVariants: [
      { rounded: false, size: "xs", className: "rounded-md" },
      { rounded: false, size: "sm", className: "rounded-lg" },
      { rounded: false, size: "md", className: "rounded-xl" },
      { rounded: false, size: "lg", className: "rounded-2xl" },
      { rounded: false, size: "xl", className: "rounded-2xl" },
      { rounded: false, size: "2xl", className: "rounded-3xl" },
    ],
    defaultVariants: {
      size: "md",
      variant: "default",
      rounded: true,
    },
  }
);

const textSizeVariants = cva("font-semibold", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      md: "text-base",
      lg: "text-3xl",
      xl: "text-5xl",
      "2xl": "text-5xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type AvatarVariant = "default" | "clickable" | "disabled";

interface AvatarProps {
  size?: AvatarSize;
  name?: string;
  imageUrl?: string;
  emoji?: string;
  onPress?: () => void;
  clickable?: boolean;
  isRounded?: boolean;
  backgroundColor?: string;
  disabled?: boolean;
  className?: string;
}

function SparkleAvatar({
  size = "md",
  name,
  imageUrl,
  emoji,
  onPress,
  clickable = false,
  isRounded = true,
  backgroundColor,
  disabled = false,
  className,
}: AvatarProps) {
  const variant: AvatarVariant = disabled
    ? "disabled"
    : onPress || clickable
      ? "clickable"
      : "default";

  const colors = name
    ? getColorFromName(name)
    : { bg: "bg-muted", text: "text-muted-foreground" };
  const bgColor = backgroundColor || colors.bg;

  const content = (
    <AvatarPrimitive.Root
      alt={name || "avatar"}
      className={cn(
        avatarVariants({ size, variant, rounded: isRounded }),
        bgColor,
        className
      )}
    >
      {imageUrl ? (
        <AvatarPrimitive.Image
          source={{ uri: imageUrl }}
          className="aspect-square size-full"
        />
      ) : emoji ? (
        <Text className={cn(textSizeVariants({ size }))}>{emoji}</Text>
      ) : name ? (
        <Text className={cn(textSizeVariants({ size }), colors.text)}>
          {/\+/.test(name) ? name : name[0].toUpperCase()}
        </Text>
      ) : (
        <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
          <Text
            className={cn(textSizeVariants({ size }), "text-muted-foreground")}
          >
            ?
          </Text>
        </AvatarPrimitive.Fallback>
      )}
    </AvatarPrimitive.Root>
  );

  if (onPress && !disabled) {
    return (
      <Pressable onPress={onPress} disabled={disabled}>
        {content}
      </Pressable>
    );
  }

  return content;
}

/**
 * Legacy Avatar components for backward compatibility
 * These use the @rn-primitives/avatar pattern with children
 */

// Legacy root that accepts children and alt prop
function LegacyAvatar({
  className,
  alt,
  children,
  ...props
}: AvatarPrimitive.RootProps &
  React.RefAttributes<AvatarPrimitive.RootRef> & {
    alt?: string;
    children?: React.ReactNode;
  }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      alt={alt}
      {...props}
    >
      {children}
    </AvatarPrimitive.Root>
  );
}

function AvatarImage({
  className,
  ...props
}: AvatarPrimitive.ImageProps & React.RefAttributes<AvatarPrimitive.ImageRef>) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.FallbackProps &
  React.RefAttributes<AvatarPrimitive.FallbackRef>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "bg-muted flex size-full flex-row items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  );
}

export {
  // Legacy Avatar (backward compatible - uses children pattern)
  LegacyAvatar as Avatar,
  AvatarFallback,
  AvatarImage,
  LegacyAvatar as AvatarRoot,
  // New Sparkle-style Avatar
  SparkleAvatar,
  avatarVariants,
  getColorFromName,
};
export type { AvatarProps, AvatarSize, AvatarVariant };
