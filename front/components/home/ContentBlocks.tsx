import { ArrowRightIcon, Button, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import React from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import {
  Grid,
  H1,
  H2,
  H3,
  H5,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import { SolutionSectionAssistantBlock } from "@app/components/home/SolutionSection";
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
        <P key={index} size="md">
          {item}
        </P>
      ));
    } else {
      return <P size="md">{content}</P>;
    }
  };

  return (
    <div className={classNames("flex flex-col gap-2", className)}>
      <div className="ml-[10%] pr-[20%] md:m-0 md:pr-[28%]">
        {children ? children : null}
      </div>
      <div className="flex flex-col px-0 py-6">
        <H3 className="text-white">{title}</H3>
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
        "flex h-full w-full flex-col overflow-hidden rounded-2xl bg-slate-200 drop-shadow-xl",
        "group transition duration-300 ease-out",
        "hover:bg-white"
      )}
    >
      {children ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-xl">
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
                  "group-hover:brightness-110",
                  "border border-slate-900/10 rounded-t-2xl"
                ),
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col p-6">
        <div className="flex flex-col gap-2">
          <H5 className="line-clamp-2 text-foreground dark:text-foreground-night">
            {title}
          </H5>
          <P
            size="xs"
            className="line-clamp-3 text-foreground dark:text-foreground-night"
          >
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
  from: string;
  to: string;
  hasCTA?: boolean;
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
  from,
  to,
  hasCTA = true,
}: HeaderContentBlockProps) => (
  <Grid>
    <div
      className={classNames(
        "sm:pt-18 flex flex-col justify-end gap-12 pt-12 lg:pt-36",
        "col-span-12",
        "sm:col-span-12",
        "lg:col-span-8 lg:col-start-2",
        "xl:col-span-8 xl:col-start-2",
        "2xl:col-start-3"
      )}
    >
      {uptitle && (
        <P
          size="lg"
          className="text-muted-foreground dark:text-muted-foreground-night"
        >
          {uptitle}
        </P>
      )}
      <H1 from={from} to={to}>
        {title}
      </H1>
      {subtitle && (
        <P size="lg" className="text-white dark:text-black">
          {subtitle}
        </P>
      )}
      {hasCTA && (
        <div className="flex gap-4">
          <Button
            variant="highlight"
            size="md"
            label="Get started"
            href="/pricing"
            icon={RocketIcon}
          />
          <Button
            href="/home/contact"
            variant="outline"
            size="md"
            label="Talk to sales"
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
  from: string;
  to: string;
}

export const MetricSection = ({ metrics, from, to }: MetricComponentProps) => (
  <div
    className={classNames(
      "grid w-full grid-cols-2 gap-8 sm:grid-cols-2",
      metrics.length === 2
        ? "lg:grid-cols-2"
        : metrics.length === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-4"
    )}
  >
    {metrics.map((metric, index) => (
      <div key={index} className="flex flex-col items-center text-center">
        {metric.logo && (
          <Image alt="alan" src={metric.logo} width={200} height={100} />
        )}
        <H1 from={from} to={to} className="mt-0">
          {metric.value}
        </H1>

        <div className="flex flex-col items-center">
          <P size="lg" className="max-w-[400px] text-black dark:text-white">
            {metric.description}
          </P>
        </div>
      </div>
    ))}
  </div>
);

interface QuoteProps {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

export const QuoteSection = ({ quote, logo, name, title }: QuoteProps) => (
  <div className="col-span-12 flex flex-col rounded-4xl pb-2 pt-4 md:col-span-10 md:col-start-2 lg:col-span-10 lg:col-start-2">
    <div className="flex justify-center">
      <div className="flex items-center justify-center">
        <Image
          src={logo}
          width={200}
          height={48}
          alt="Company Logo"
          className="h-auto w-[140px] xs:w-[160px] sm:w-[200px]"
        />
        <P
          size="sm"
          className="text-sm text-primary-400 xs:text-left xs:text-base sm:text-lg"
        >
          <Strong>
            <span className="text-pink-300">{name}</span>
          </Strong>
          <br /> {title}
        </P>
      </div>
    </div>
    <div className="flex flex-col items-center rounded-4xl p-4 text-center font-objektiv text-base italic text-white xs:text-lg sm:text-xl lg:text-2xl">
      &ldquo; {quote} &rdquo;
    </div>
  </div>
);

interface CarousselContentBlockProps {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  assistants: SolutionSectionAssistantBlockProps[];
  from: string;
  to: string;
  border: string;
  href: string;
}

export const CarousselContentBlock = ({
  title,
  subtitle,
  description,
  assistants,
  from,
  to,
  border,
  href,
}: CarousselContentBlockProps) => (
  <div
    className={classNames(
      "flex flex-col gap-6 rounded-3xl border bg-gradient-to-br py-8 md:h-full",
      from,
      to,
      border
    )}
  >
    <div className="flex flex-col gap-4 px-8 md:flex-1">
      <H3 className="text-slate-800">{"Dust for " + title}</H3>
      <div className="flex flex-col gap-2">
        <H2 className="w-full text-white">{subtitle}</H2>
        <P size="md" className="w-full text-slate-700">
          {description}
        </P>
      </div>
      <div className="w-full text-left">
        <Link href={href} shallow={true} className="inline-block max-w-full">
          <Button
            label={"Discover Dust"}
            variant="outline"
            size="md"
            icon={ArrowRightIcon}
            className="flex max-w-full md:hidden"
          />
          <Button
            label={"Discover Dust for " + title}
            variant="outline"
            size="md"
            icon={ArrowRightIcon}
            className="hidden max-w-full md:flex"
          />
        </Link>
      </div>
    </div>
    <Carousel className="w-full" isLooping={true}>
      <CarouselContent>
        {assistants.map((block, index) => (
          <CarouselItem key={index} className="basis-1/2 px-6 md:basis-1/4">
            <SolutionSectionAssistantBlock {...block} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="flex w-full flex-row items-center justify-end gap-3 px-8 md:hidden">
        <CarouselPrevious />
        <CarouselNext />
      </div>
    </Carousel>
  </div>
);
