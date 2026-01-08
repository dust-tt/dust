import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable, View, type ViewProps } from "react-native";

/**
 * Card component aligned with Sparkle design system
 *
 * Variants:
 * - primary: Muted background, no border (for highlighted cards)
 * - secondary: White background with border (default cards)
 * - tertiary: White background, no border (minimal cards)
 *
 * Sizes:
 * - sm: 12px padding, rounded-xl
 * - md: 16px padding, rounded-2xl (default)
 * - lg: 20px padding, rounded-3xl
 */
const cardVariants = cva("flex flex-col overflow-hidden", {
  variants: {
    variant: {
      primary: cn(
        "bg-muted border-transparent",
        "dark:bg-gray-800 dark:border-transparent"
      ),
      secondary: cn(
        "bg-card border border-border",
        "dark:bg-card dark:border-border"
      ),
      tertiary: cn(
        "bg-card border-transparent",
        "dark:bg-card dark:border-transparent"
      ),
    },
    size: {
      sm: "p-3 rounded-xl gap-3",
      md: "p-4 rounded-2xl gap-4",
      lg: "p-5 rounded-3xl gap-5",
    },
    interactive: {
      true: Platform.select({
        web: "cursor-pointer transition duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-150 dark:active:bg-gray-700",
        default: "active:bg-gray-100 dark:active:bg-gray-800",
      }),
      false: "",
    },
    selected: {
      true: cn(
        "border-blue-300 dark:border-blue-400",
        "shadow-sm"
      ),
      false: "",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
    interactive: false,
    selected: false,
  },
});

type CardVariantProps = VariantProps<typeof cardVariants>;

interface CardProps extends ViewProps, CardVariantProps {
  onPress?: () => void;
}

function Card({
  className,
  variant,
  size,
  interactive,
  selected,
  onPress,
  children,
  ...props
}: CardProps & React.RefAttributes<View>) {
  const isInteractive = interactive || !!onPress;

  const content = (
    <TextClassContext.Provider value="text-card-foreground">
      {children}
    </TextClassContext.Provider>
  );

  if (isInteractive) {
    return (
      <Pressable
        className={cn(
          cardVariants({ variant, size, interactive: true, selected }),
          className
        )}
        onPress={onPress}
        {...props}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        cardVariants({ variant, size, interactive: false, selected }),
        className
      )}
      {...props}
    >
      {content}
    </View>
  );
}

function CardHeader({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return <View className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
  return (
    <Text
      variant="heading-lg"
      role="heading"
      aria-level={3}
      className={cn("", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
  return (
    <Text
      variant="copy-sm"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return <View className={cn("", className)} {...props} />;
}

function CardFooter({
  className,
  ...props
}: ViewProps & React.RefAttributes<View>) {
  return (
    <View className={cn("flex flex-row items-center", className)} {...props} />
  );
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
};
export type { CardProps };
