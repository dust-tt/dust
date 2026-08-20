import { Card } from "@sparkle/components/Card";
import { Spinner } from "@sparkle/components/Spinner";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

interface CardRootProps {
  children: React.ReactNode;
  className?: string;
}
const Root = ({ className, children }: CardRootProps) => (
  <Card size="md" className={cn("flex flex-col gap-2", className)}>
    {children}
  </Card>
);

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

const Header = ({ className, children }: CardHeaderProps) => (
  <div className={cn("space-y-0.5", className)}>{children}</div>
);

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

const Title = ({ className, children }: CardTitleProps) => (
  <div className={cn("heading-sm", "text-foreground", className)}>
    {children}
  </div>
);

interface CardSubtitleProps {
  children: React.ReactNode;
  className?: string;
}

const Subtitle = ({ className, children }: CardSubtitleProps) => (
  <div className={cn("text-sm", "text-muted-foreground", className)}>
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
      <div className="flex items-center justify-start">
        <Spinner size="xs" variant="dark" />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-3", "text-foreground", className)}>
      {children}
    </div>
  );
};

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

const Footer = ({ className, children }: CardFooterProps) => (
  <div className={cn("flex items-center gap-2", className)}>{children}</div>
);

interface CardProps {
  title: string;
  subtitle?: string;
  /** Slot for the figure (number, icon, trend); keep it to a single primary value. */
  content: React.ReactNode;
  /** Optional row rendered below the content, e.g. a trend or link. */
  footer?: React.ReactNode;
  /** Replaces the content with a small spinner while the value loads. */
  isLoading?: boolean;
  className?: string;
}

/**
 * A compact metric card surfacing a single value with a `title`, optional `subtitle`,
 * and a `content` slot for the figure (number, icon, trend), plus an `isLoading` state.
 * Use it on dashboards and overviews to highlight a key metric or KPI; for a
 * non-standard arrangement of the parts, compose them directly with `ComposableCard`
 * (Root, Header, Title, Subtitle, Content, Footer).
 *
 * @summary Compact single-metric card.
 */
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
