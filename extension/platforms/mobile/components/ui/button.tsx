import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable } from "react-native";

/**
 * Button component aligned with Sparkle design system
 *
 * Variants:
 * - primary: Gray-based primary button
 * - highlight: Blue-based for CTAs and primary actions
 * - highlight-secondary: Outlined blue for secondary CTAs
 * - warning: Rose/red-based for destructive actions
 * - warning-secondary: Outlined rose for secondary destructive
 * - outline: Neutral outlined button
 * - ghost: Transparent with hover state
 * - ghost-secondary: Transparent muted text
 *
 * Sizes:
 * - xs: 28px height (touch-friendly minimum)
 * - sm: 36px height (default)
 * - md: 48px height (prominent actions)
 * - icon: Square button for icons only
 */
const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2 rounded-xl",
    Platform.select({
      web: "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0 outline-none transition-all disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        // Primary - gray-based (like Sparkle)
        primary: cn(
          "bg-gray-900 dark:bg-gray-100 active:bg-gray-800 dark:active:bg-gray-200",
          Platform.select({ web: "hover:bg-gray-800 dark:hover:bg-gray-200" })
        ),
        // Highlight - blue-based for CTAs
        highlight: cn(
          "bg-blue-500 active:bg-blue-600 dark:bg-blue-400 dark:active:bg-blue-500",
          Platform.select({
            web: "hover:bg-blue-400 dark:hover:bg-blue-300",
          })
        ),
        // Highlight Secondary - outlined blue
        "highlight-secondary": cn(
          "border border-border bg-background active:bg-blue-100 dark:active:bg-blue-900",
          Platform.select({
            web: "hover:bg-blue-50 dark:hover:bg-blue-900/50",
          })
        ),
        // Warning - rose-based for destructive
        warning: cn(
          "bg-rose-500 active:bg-rose-600 dark:bg-rose-400 dark:active:bg-rose-500",
          Platform.select({
            web: "hover:bg-rose-400 dark:hover:bg-rose-300",
          })
        ),
        // Warning Secondary - outlined rose
        "warning-secondary": cn(
          "border border-border bg-background active:bg-rose-100 dark:active:bg-rose-900",
          Platform.select({
            web: "hover:bg-rose-50 dark:hover:bg-rose-900/50",
          })
        ),
        // Outline - neutral outlined
        outline: cn(
          "border border-border bg-background active:bg-gray-100 dark:active:bg-gray-800",
          Platform.select({
            web: "hover:bg-gray-50 dark:hover:bg-gray-800/50",
          })
        ),
        // Ghost - transparent
        ghost: cn(
          "active:bg-gray-100 dark:active:bg-gray-800",
          Platform.select({
            web: "hover:bg-gray-100 dark:hover:bg-gray-800",
          })
        ),
        // Ghost Secondary - transparent muted
        "ghost-secondary": cn(
          "active:bg-gray-100 dark:active:bg-gray-800",
          Platform.select({
            web: "hover:bg-gray-100 dark:hover:bg-gray-800",
          })
        ),

        // Legacy variants for backward compatibility
        default: cn(
          "bg-primary active:bg-primary/90 shadow-sm shadow-black/5",
          Platform.select({ web: "hover:bg-primary/90" })
        ),
        destructive: cn(
          "bg-destructive active:bg-destructive/90 shadow-sm shadow-black/5",
          Platform.select({
            web: "hover:bg-destructive/90",
          })
        ),
        secondary: cn(
          "bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5",
          Platform.select({ web: "hover:bg-secondary/80" })
        ),
        link: "",
      },
      size: {
        xs: cn(
          "h-7 px-2.5 rounded-lg",
          Platform.select({ web: "has-[>svg]:px-2" })
        ),
        sm: cn(
          "h-9 px-3 rounded-xl",
          Platform.select({ web: "has-[>svg]:px-2.5" })
        ),
        md: cn(
          "h-12 px-4 rounded-2xl",
          Platform.select({ web: "has-[>svg]:px-3" })
        ),
        icon: "h-10 w-10 rounded-xl",

        // Legacy sizes
        default: cn(
          "h-10 px-4 py-2 rounded-md sm:h-9",
          Platform.select({ web: "has-[>svg]:px-3" })
        ),
        lg: cn(
          "h-11 rounded-md px-6 sm:h-10",
          Platform.select({ web: "has-[>svg]:px-4" })
        ),
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

const buttonTextVariants = cva(
  cn(
    "text-sm font-semibold",
    Platform.select({ web: "pointer-events-none transition-colors" })
  ),
  {
    variants: {
      variant: {
        // Sparkle-aligned text colors
        primary: "text-white dark:text-gray-950",
        highlight: "text-white",
        "highlight-secondary": "text-blue-500 dark:text-blue-400",
        warning: "text-white",
        "warning-secondary": "text-rose-500 dark:text-rose-400",
        outline: "text-foreground",
        ghost: cn(
          "text-foreground",
          Platform.select({ web: "group-hover:text-foreground" })
        ),
        "ghost-secondary": "text-muted-foreground",

        // Legacy text colors
        default: "text-primary-foreground",
        destructive: "text-white",
        secondary: "text-secondary-foreground",
        link: cn(
          "text-highlight group-active:underline",
          Platform.select({
            web: "underline-offset-4 hover:underline group-hover:underline",
          })
        ),
      },
      size: {
        xs: "text-xs",
        sm: "text-sm",
        md: "text-base",
        icon: "",
        default: "",
        lg: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(
          props.disabled && "opacity-50",
          buttonVariants({ variant, size }),
          className
        )}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
