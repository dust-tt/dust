import { cva } from "class-variance-authority";
import React from "react";

export const preBlockVariants = cva(
  [
    "s-my-2 s-w-full s-break-all s-rounded-2xl s-border",
    "s-border-border-dark dark:s-border-border-dark-night",
  ],
  {
    variants: {
      variant: {
        muted: "s-bg-gray-700 s-text-gray-500 dark:s-bg-muted-background-night",
        surface: "s-bg-muted-background dark:s-bg-muted-background-night",
      },
    },
  }
);

interface PreBlockProps {
  children: React.ReactNode;
  variant?: "muted" | "surface";
}

export function PreBlock({ children, variant = "surface" }: PreBlockProps) {
  const validChildrenContent =
    Array.isArray(children) && children[0]
      ? children[0].props.children[0]
      : null;

  let fallbackData: string | null = null;
  if (!validChildrenContent) {
    fallbackData =
      Array.isArray(children) && children[0]
        ? children[0].props?.node?.data?.meta
        : null;
  }

  return (
    <pre className={preBlockVariants({ variant })}>
      {validChildrenContent ? children : fallbackData || children}
    </pre>
  );
}
