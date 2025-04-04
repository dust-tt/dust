import { Button, cn, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import type { ReactNode } from "react";
import React from "react";

import {
  Grid,
  H1,
  H2,
  H3,
  H5,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

interface ImgBlockProps {
  children?: React.ReactNode;
  title: React.ReactNode;
  content: React.ReactNode | React.ReactNode[];
  className?: string;
}

export const ImgBlock: React.FC<ImgBlockProps> = ({
  children,
  title,
  content,
  className = "",
}) => {
  const renderContent = () => {
    if (Array.isArray(content)) {
      return content.map((item, index) => (
        <P key={index} size="md" className="text-muted-foreground">
          {item}
        </P>
      ));
    } else {
      return (
        <P size="md" className="text-muted-foreground">
          {content}
        </P>
      );
    }
  };

  return (
    <div
      className={classNames(
        "flex flex-col gap-2 overflow-hidden bg-muted-background",
        className
      )}
    >
      <div className="flex aspect-video items-center justify-center bg-primary-800 p-4">
        <div className="max-w-[400px]">{children ? children : null}</div>
      </div>
      <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
        <H3 className="text-foreground">{title}</H3>
        {renderContent()}
      </div>
    </div>
  );
};

interface BlogBlockProps {
  children?: React.ReactNode;
  title: React.ReactNode;
  content: React.ReactNode;
  href: string;
  className?: string;
}

export const BlogBlock: React.FC<BlogBlockProps> = ({
  children,
  title,
  content,
  href,
  className = "",
}) => {
  return (
    <a
      href={href}
      target="_blank"
      className={classNames(
        className,
        "flex h-full w-full flex-col overflow-hidden bg-muted-background",
        "group transition duration-300 ease-out",
        "hover:bg-primary-100"
      )}
    >
      {children ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {React.Children.map(children, (child) => {
            if (
              React.isValidElement<React.ImgHTMLAttributes<HTMLImageElement>>(
                child
              ) &&
              child.type === "img"
            ) {
              return React.cloneElement(child, {
                className: classNames(
                  "absolute h-full w-full object-cover",
                  "brightness-100 transition duration-300 ease-out",
                  "group-hover:brightness-110"
                ),
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col p-8">
        <div className="flex flex-col gap-2">
          <H5 className="line-clamp-2 text-foreground">{title}</H5>
          <P size="sm" className="line-clamp-3 text-muted-foreground">
            {content}
          </P>
        </div>
      </div>
    </a>
  );
};

interface HeaderContentBlockProps {
  title: ReactNode;
  subtitle?: ReactNode;
  uptitle?: string;
  hasCTA?: boolean;
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
  hasCTA = true,
}: HeaderContentBlockProps) => (
  <Grid>
    <div
      className={classNames(
        "sm:pt-18 flex flex-col justify-end gap-12 pt-12 lg:pt-36",
        "col-span-12",
        "sm:col-span-12 md:col-span-12",
        "lg:col-span-8 lg:col-start-2",
        "xl:col-span-8 xl:col-start-2",
        "2xl:col-start-3"
      )}
    >
      {uptitle && (
        <P size="lg" className="text-brand-hunter-green">
          {uptitle}
        </P>
      )}
      <H1>{title}</H1>
      {subtitle && (
        <P size="lg" className="text-foreground">
          {subtitle}
        </P>
      )}
      {hasCTA && (
        <div className="flex flex-col gap-4 xs:flex-row sm:flex-row md:flex-row">
          <Button
            variant="highlight"
            size="md"
            label="Get started"
            href="/pricing"
            icon={RocketIcon}
            className="w-full xs:w-auto sm:w-auto md:w-auto"
          />
          <Button
            href="/home/contact"
            variant="outline"
            size="md"
            label="Talk to sales"
            className="w-full xs:w-auto sm:w-auto md:w-auto"
          />
        </div>
      )}
    </div>
  </Grid>
);

interface MetricComponentProps {
  metrics: {
    value: string;
    description: ReactNode;
    logo?: string;
  }[];
  color?: "blue" | "green" | "rose" | "golden";
}

const getColorClasses = (color: MetricComponentProps["color"] = "golden") => {
  switch (color) {
    case "blue":
      return {
        bg: "bg-brand-electric-blue/10",
        text: "text-brand-electric-blue",
      };
    case "green":
      return {
        bg: "bg-green-100",
        text: "text-green-600",
      };
    case "rose":
      return {
        bg: "bg-brand-red-rose/10",
        text: "text-brand-red-rose",
      };
    case "golden":
      return {
        bg: "bg-golden-100",
        text: "text-golden-600",
      };
  }
};

export const MetricSection = ({
  metrics,
  color = "golden",
}: MetricComponentProps) => {
  const colors = getColorClasses(color);

  return (
    <div className="flex flex-col gap-y-8 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-8 lg:flex lg:flex-row lg:justify-center lg:gap-8">
      {metrics.map((metric, index) => (
        <div key={index} className="h-full flex-1 lg:flex-1">
          <div
            className={classNames(
              "flex h-[220px] w-[220px] flex-col items-center justify-center rounded-full",
              "mx-auto",
              colors.bg
            )}
          >
            {metric.logo && (
              <Image
                alt="alan"
                src={metric.logo}
                width={100}
                height={50}
                className="mb-3"
              />
            )}
            <H2
              className={classNames(
                "text-center text-5xl font-medium",
                colors.text
              )}
            >
              <span>{metric.value}</span>
            </H2>
            <P size="sm" className="mt-3 px-6 text-center text-foreground">
              {metric.description}
            </P>
          </div>
        </div>
      ))}
    </div>
  );
};

interface QuoteProps {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

export const QuoteSection = ({ quote, logo, name, title }: QuoteProps) => (
  <div className="col-span-12 my-16 flex flex-col items-center justify-center md:my-12 lg:col-span-10 lg:col-start-2 lg:my-8">
    <div
      className={cn(
        "flex max-w-[500px] flex-col items-center p-4 text-center font-sans italic text-foreground",
        "copy-base xs:copy-lg sm:copy-xl md:copy-xl lg:copy-2xl"
      )}
    >
      &ldquo; {quote} &rdquo;
    </div>
    <div className="align-center flex justify-center">
      <div className="flex items-center justify-center gap-4">
        <Image
          src={logo}
          width={160}
          height={40}
          alt="Company Logo"
          className="h-auto w-[120px] object-contain xs:w-[140px] sm:w-[160px]"
        />
        <div className="flex flex-col">
          <P
            size="md"
            className={cn(
              "text-foreground",
              "xs:copy-left copy-base sm:copy-lg md:copy-xl"
            )}
          >
            <Strong>{name}</Strong>
          </P>
          <P
            size="sm"
            className={cn(
              "-mt-1 italic text-muted-foreground",
              "xs:copy-left copy-sm xs:copy-base sm:copy-lg md:copy-lg"
            )}
          >
            {title}
          </P>
        </div>
      </div>
    </div>
  </div>
);

export function ContentBlock({
  title,
  description,
  image,
  imageAlt,
}: {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Image
        src={image}
        alt={imageAlt}
        width={1200}
        height={630}
        className="w-full"
      />
      <H2>{title}</H2>
      <P>{description}</P>
    </div>
  );
}
