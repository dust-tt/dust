import * as React from "react";

import { Card, Spinner } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

interface CardRootProps {
  children: React.ReactNode;
  className?: string;
}
const Root = ({ className, children }: CardRootProps) => (
  <Card size="md" className={cn("s-flex s-flex-col s-gap-2", className)}>
    {children}
  </Card>
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
    className={cn(
      "s-heading-sm",
      "s-text-foreground dark:s-text-foreground-night",
      className
    )}
  >
    {children}
  </div>
);

interface CardSubtitleProps {
  children: React.ReactNode;
  className?: string;
}

const Subtitle = ({ className, children }: CardSubtitleProps) => (
  <div
    className={cn(
      "s-text-sm",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
      className
    )}
  >
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
        <Spinner size="xs" variant="dark" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "s-flex s-flex-col s-gap-3",
        "s-text-foreground dark:s-text-foreground-night",
        className
      )}
    >
      {children}
    </div>
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
  className?: string;
}

export const ValueCard = ({
  title,
  subtitle,
  content,
  footer,
  isLoading = false,
  className,
}: CardProps) => {
  return (
    <Root className={className}>
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
