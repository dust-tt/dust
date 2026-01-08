/**
 * UI Components - Sparkle-aligned design system for React Native
 *
 * These components are inspired by the Dust/Sparkle design system
 * and adapted for React Native mobile development.
 */

// Core components
export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarRoot,
  SparkleAvatar,
} from "./avatar";
export type { AvatarProps, AvatarSize, AvatarVariant } from "./avatar";

export { Button, buttonTextVariants, buttonVariants } from "./button";
export type { ButtonProps } from "./button";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
} from "./card";
export type { CardProps } from "./card";

export { Badge, Chip } from "./chip";
export type { BadgeProps, ChipColor, ChipProps, ChipSize } from "./chip";

export { Input, inputVariants } from "./input";
export type { InputProps, MessageStatus } from "./input";

export { Separator } from "./separator";

export { DotsSpinner, Spinner } from "./spinner";
export type { SpinnerProps, SpinnerSize, SpinnerVariant } from "./spinner";

export { Text, TextClassContext, textVariants } from "./text";
