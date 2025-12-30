import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { ActivityIndicator, Animated, Easing, View } from "react-native";
import { colors } from "@/lib/colors";

/**
 * Spinner component aligned with Sparkle design system
 *
 * Sizes:
 * - xs: 16px
 * - sm: 20px
 * - md: 24px (default)
 * - lg: 32px
 * - xl: 48px
 *
 * Variants:
 * - mono: Adapts to light/dark mode (default)
 * - light: Always light colored (for dark backgrounds)
 * - dark: Always dark colored (for light backgrounds)
 * - highlight: Uses the highlight (blue) color
 */

const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
type SpinnerSize = (typeof SPINNER_SIZES)[number];

const SPINNER_VARIANTS = ["mono", "light", "dark", "highlight"] as const;
type SpinnerVariant = (typeof SPINNER_VARIANTS)[number];

const sizePx: Record<SpinnerSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48,
};

const sizeToRNSize: Record<SpinnerSize, "small" | "large"> = {
  xs: "small",
  sm: "small",
  md: "small",
  lg: "large",
  xl: "large",
};

const spinnerContainerVariants = cva("items-center justify-center", {
  variants: {
    size: {
      xs: "w-4 h-4",
      sm: "w-5 h-5",
      md: "w-6 h-6",
      lg: "w-8 h-8",
      xl: "w-12 h-12",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
}

function Spinner({ size = "md", variant = "mono", className }: SpinnerProps) {
  const getColor = (): string => {
    switch (variant) {
      case "light":
        return colors.gray[50];
      case "dark":
        return colors.gray[900];
      case "highlight":
        return colors.blue[500];
      case "mono":
      default:
        // For mono, we return undefined to use system default
        // which adapts to light/dark mode
        return colors.gray[500];
    }
  };

  return (
    <View className={cn(spinnerContainerVariants({ size }), className)}>
      <ActivityIndicator size={sizeToRNSize[size]} color={getColor()} />
    </View>
  );
}

/**
 * Custom animated spinner with dots (Sparkle-style)
 * For use when you want more visual alignment with Sparkle
 */
interface DotsSpinnerProps extends SpinnerProps {}

function DotsSpinner({
  size = "md",
  variant = "mono",
  className,
}: DotsSpinnerProps) {
  const spinValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const getColor = (): string => {
    switch (variant) {
      case "light":
        return colors.gray[50];
      case "dark":
        return colors.gray[900];
      case "highlight":
        return colors.blue[500];
      case "mono":
      default:
        return colors.gray[500];
    }
  };

  const dotSize = sizePx[size] / 4;
  const containerSize = sizePx[size];

  return (
    <View
      className={cn(spinnerContainerVariants({ size }), className)}
      style={{ width: containerSize, height: containerSize }}
    >
      <Animated.View
        style={{
          width: containerSize,
          height: containerSize,
          transform: [{ rotate: spin }],
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const angle = (i * 90 * Math.PI) / 180;
          const radius = (containerSize - dotSize) / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const opacity = 0.25 + i * 0.25;

          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: getColor(),
                opacity,
                transform: [{ translateX: x }, { translateY: y }],
              }}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

export { DotsSpinner, Spinner, spinnerContainerVariants };
export type { SpinnerProps, SpinnerSize, SpinnerVariant };
