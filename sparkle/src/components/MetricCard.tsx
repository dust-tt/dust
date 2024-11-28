import { Spinner } from "@dust-tt/sparkle";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const METRIC_CARD_SIZES = ["xs", "sm", "md"] as const;
export type MetricCardSizeType = (typeof METRIC_CARD_SIZES)[number];

const STYLES = {
  text: {
    title: "s-text-sm s-font-semibold s-text-element-800",
    subtitle: "s-text-sm s-text-element-700",
    content: "s-text-md s-text-element-700",
  },
  layout: {
    header: "s-space-y-0.5",
    content: "s-flex s-flex-col s-gap-3",
    footer: "s-flex s-items-center s-gap-2",
    loading: "s-flex s-items-center s-justify-start",
  },
} as const;

const metricCardVariants = cva(
  "s-flex s-flex-col s-gap-2 s-rounded-2xl s-bg-structure-50 s-p-4 s-min-h-[128px]",
  {
    variants: {
      size: {
        xs: "s-w-[180px]",
        sm: "s-w-[240px]",
        md: "s-w-[300px]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

interface BaseProps {
  className?: string;
  children: React.ReactNode;
}

interface MetricCardRootProps
  extends BaseProps,
    VariantProps<typeof metricCardVariants> {}
interface MetricCardHeaderProps extends BaseProps {}
interface MetricCardTitleProps extends BaseProps {}
interface MetricCardSubtitleProps extends BaseProps {}
interface MetricCardContentProps extends Omit<BaseProps, "children"> {
  children?: React.ReactNode;
  isLoading?: boolean;
}
interface MetricCardFooterProps extends BaseProps {}

const Root: React.FC<MetricCardRootProps> = ({ size, className, children }) => {
  return (
    <div className={cn(metricCardVariants({ size }), className)}>
      {children}
    </div>
  );
};

const Header: React.FC<MetricCardHeaderProps> = ({ className, children }) => {
  return <div className={cn(STYLES.layout.header, className)}>{children}</div>;
};

const Title: React.FC<MetricCardTitleProps> = ({ className, children }) => {
  return <div className={cn(STYLES.text.title, className)}>{children}</div>;
};

const Subtitle: React.FC<MetricCardSubtitleProps> = ({
  className,
  children,
}) => {
  return <div className={cn(STYLES.text.subtitle, className)}>{children}</div>;
};

const Content: React.FC<MetricCardContentProps> = ({
  className,
  children,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className={cn(STYLES.text.content, STYLES.layout.loading)}>
        <Spinner size="sm" />
      </div>
    );
  }

  return <div className={cn(STYLES.layout.content, className)}>{children}</div>;
};

const Footer: React.FC<MetricCardFooterProps> = ({ className, children }) => {
  return <div className={cn(STYLES.layout.footer, className)}>{children}</div>;
};

export const MetricCard: {
  Root: React.FC<MetricCardRootProps>;
  Header: React.FC<MetricCardHeaderProps>;
  Title: React.FC<MetricCardTitleProps>;
  Subtitle: React.FC<MetricCardSubtitleProps>;
  Content: React.FC<MetricCardContentProps>;
  Footer: React.FC<MetricCardFooterProps>;
} = {
  Root,
  Header,
  Title,
  Subtitle,
  Content,
  Footer,
};
