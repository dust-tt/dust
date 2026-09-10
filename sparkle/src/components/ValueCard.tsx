import { Card } from "@sparkle/components/Card";
import { LoadingBlock } from "@sparkle/components/LoadingBlock";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

export const VALUE_CARD_SIZES = ["sm", "md"] as const;
export type ValueCardSizeType = (typeof VALUE_CARD_SIZES)[number];

interface CardRootProps {
  children: React.ReactNode;
  className?: string;
  size?: ValueCardSizeType;
}
const Root = ({ className, children, size = "md" }: CardRootProps) => (
  <Card
    size="md"
    className={cn(
      "flex flex-col",
      size === "sm" ? "justify-center gap-1" : "gap-2",
      className
    )}
  >
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
  size?: ValueCardSizeType;
}

const Title = ({ className, children, size = "md" }: CardTitleProps) => (
  <div
    className={cn(
      size === "sm"
        ? "text-xs font-semibold text-muted-foreground"
        : "heading-sm text-foreground",
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
  <div className={cn("text-sm", "text-muted-foreground", className)}>
    {children}
  </div>
);

interface CardContentProps {
  children?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  size?: ValueCardSizeType;
}

const Content = ({
  className,
  children,
  isLoading = false,
  size = "md",
}: CardContentProps) => {
  if (isLoading) {
    return (
      <LoadingBlock
        aria-hidden="true"
        className={size === "sm" ? "h-5 w-20" : "h-7 w-24"}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col text-foreground",
        size === "sm" ? "text-base font-semibold" : "gap-3",
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
  size?: ValueCardSizeType;
}

const Footer = ({ className, children, size = "md" }: CardFooterProps) => (
  <div
    className={cn(
      "flex items-center gap-2",
      size === "sm" && "text-xs text-muted-foreground",
      className
    )}
  >
    {children}
  </div>
);

interface CardProps {
  title: string;
  subtitle?: string;
  /** Slot for the figure (number, icon, trend); keep it to a single primary value. */
  content: React.ReactNode;
  /** Optional row rendered below the content, e.g. a trend, a hint or a link. */
  footer?: React.ReactNode;
  /** Replaces the content with a skeleton block while the value loads. */
  isLoading?: boolean;
  /**
   * `md` (default) is the dashboard KPI card; `sm` is the dense summary card
   * with a muted label, a base-size figure and a small footer hint, for rows
   * of several metrics.
   */
  size?: ValueCardSizeType;
  className?: string;
}

/**
 * A compact metric card surfacing a single value with a `title`, optional `subtitle`,
 * and a `content` slot for the figure (number, icon, trend), plus an `isLoading`
 * skeleton state and two densities via `size`.
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
  size = "md",
  className,
}: CardProps) => {
  return (
    <Root className={className} size={size}>
      <Header>
        <Title size={size}>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Header>
      <Content isLoading={isLoading} size={size}>
        {content}
      </Content>
      {footer && <Footer size={size}>{footer}</Footer>}
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
