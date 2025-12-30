import { cn } from "@/lib/utils";
import * as Slot from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Platform, Text as RNText, type Role } from "react-native";

/**
 * Text component aligned with Sparkle design system
 *
 * Variants:
 * - Labels: label-xs, label-sm, label-base (semibold)
 * - Headings: heading-xs through heading-5xl (medium/semibold)
 * - Copy: copy-xs, copy-sm, copy-base, copy-lg (regular)
 * - Legacy: h1-h4, p, blockquote, code, lead, large, small, muted
 */
const textVariants = cva(
  cn(
    "text-foreground text-base",
    Platform.select({
      web: "select-text",
    })
  ),
  {
    variants: {
      variant: {
        default: "",

        // Sparkle Labels (semibold, smaller sizes)
        "label-xs": "text-xs font-semibold",
        "label-sm": "text-sm font-semibold",
        "label-base": "text-base font-semibold",

        // Sparkle Headings (medium weight)
        "heading-xs": "text-xs font-medium",
        "heading-sm": "text-sm font-medium",
        "heading-base": "text-base font-medium",
        "heading-lg": "text-lg font-medium",
        "heading-xl": "text-xl font-medium",
        "heading-2xl": "text-2xl font-semibold",
        "heading-3xl": "text-3xl font-semibold",
        "heading-4xl": "text-4xl font-semibold",
        "heading-5xl": "text-5xl font-semibold",

        // Sparkle Copy (regular weight)
        "copy-xs": "text-xs font-normal",
        "copy-sm": "text-sm font-normal",
        "copy-base": "text-base font-normal",
        "copy-lg": "text-lg font-normal",
        "copy-xl": "text-xl font-normal",

        // Legacy variants for backward compatibility
        h1: cn(
          "text-center text-4xl font-bold tracking-tight",
          Platform.select({ web: "scroll-m-20 text-balance" })
        ),
        h2: cn(
          "border-border border-b pb-2 text-3xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20 first:mt-0" })
        ),
        h3: cn(
          "text-2xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20" })
        ),
        h4: cn(
          "text-xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20" })
        ),
        p: "mt-3 leading-7 sm:mt-6",
        blockquote: "mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6",
        code: cn(
          "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
        ),
        lead: "text-muted-foreground text-xl",
        large: "text-lg font-semibold",
        small: "text-sm font-medium leading-none",
        muted: "text-muted-foreground text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps["variant"]>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  "heading-xs": "heading",
  "heading-sm": "heading",
  "heading-base": "heading",
  "heading-lg": "heading",
  "heading-xl": "heading",
  "heading-2xl": "heading",
  "heading-3xl": "heading",
  "heading-4xl": "heading",
  "heading-5xl": "heading",
  blockquote: Platform.select({ web: "blockquote" as Role }),
  code: Platform.select({ web: "code" as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
  "heading-5xl": "1",
  "heading-4xl": "1",
  "heading-3xl": "2",
  "heading-2xl": "2",
  "heading-xl": "3",
  "heading-lg": "3",
  "heading-base": "4",
  "heading-sm": "5",
  "heading-xs": "6",
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RNText> &
  TextVariantProps &
  React.RefAttributes<RNText> & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext, textVariants };
