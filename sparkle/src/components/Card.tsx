import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Spinner } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

const CARD_SIZES = ["xs", "sm", "md", "lg"] as const;
export type CardSizeType = (typeof CARD_SIZES)[number];

const cardVariants = cva(
  "s-flex s-flex-col s-gap-2 s-rounded-2xl s-bg-structure-50 s-p-4 s-min-h-[128px]",
  {
    variants: {
      size: {
        xs: "s-w-[180px]",
        sm: "s-w-[240px]",
        md: "s-w-[300px]",
        lg: "s-w-[360px]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

interface CardRootProps extends VariantProps<typeof cardVariants> {
  children: React.ReactNode;
  className?: string;
}
const Root = ({ size, className, children }: CardRootProps) => (
  <div className={cn(cardVariants({ size }), className)}>{children}</div>
);

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

const Header = ({ className, children }: CardHeaderProps) => (
  <div className={cn("s-space-y-0.5", className)}>{children}</div>
);

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

const Title = ({ className, children }: CardTitleProps) => (
  <div
    className={cn("s-text-sm s-font-semibold s-text-element-800", className)}
  >
    {children}
  </div>
);

interface CardSubtitleProps {
  children: React.ReactNode;
  className?: string;
}

const Subtitle = ({ className, children }: CardSubtitleProps) => (
  <div className={cn("s-text-sm s-text-element-700", className)}>
    {children}
  </div>
);

interface CardContentProps {
  children?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

const Content = ({
  className,
  children,
  isLoading = false,
}: CardContentProps) => {
  if (isLoading) {
    return (
      <div className="s-flex s-items-center s-justify-start">
        <Spinner size="sm" />
      </div>
    );
  }
  return (
    <div className={cn("s-flex s-flex-col s-gap-3", className)}>{children}</div>
  );
};

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

const Footer = ({ className, children }: CardFooterProps) => (
  <div className={cn("s-flex s-items-center s-gap-2", className)}>
    {children}
  </div>
);

interface CardProps {
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  footer?: React.ReactNode;
  isLoading?: boolean;
  size?: CardSizeType;
  className?: string;
}

export const Card = ({
  title,
  subtitle,
  content,
  footer,
  isLoading = false,
  size = "sm",
  className,
}: CardProps) => {
  return (
    <Root size={size} className={className}>
      <Header>
        <Title>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Header>
      <Content isLoading={isLoading}>{content}</Content>
      {footer && <Footer>{footer}</Footer>}
    </Root>
  );
};

export const ComposableCard = {
  Root,
  Header,
  Title,
  Subtitle,
  Content,
  Footer,
};
