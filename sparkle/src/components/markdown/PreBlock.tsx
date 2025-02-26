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
        surface: "s-bg-slate-100 dark:s-bg-muted-background-night",
      },
    },
  }
);

interface PreBlockProps {
  children: React.ReactNode;
  variant?: "surface";
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
