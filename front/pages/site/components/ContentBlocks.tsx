import { ArrowRightIcon, Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactNode } from "react";
import React from "react";

import { classNames } from "@app/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/pages/site/components/Carousel";
import {
  Grid,
  H1,
  H2,
  H3,
  H5,
  P,
} from "@app/pages/site/components/ContentComponents";
import type { SolutionSectionAssistantBlockProps } from "@app/pages/site/components/SolutionSection";
import { SolutionSectionAssistantBlock } from "@app/pages/site/components/SolutionSection";

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
    <div className={classNames("flex flex-col gap-12", className)}>
      <div className="ml-[10%] pr-[20%] md:m-0 md:pr-[28%]">
        {children ? children : null}
      </div>
      <div className="flex flex-col gap-2 lg:gap-4">
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
        "flex flex-col overflow-hidden rounded-2xl bg-slate-200 drop-shadow-xl",
        "group transition duration-300 ease-out",
        "scale-100 hover:scale-100 hover:bg-white"
      )}
    >
      {children ? (
        <div className="relative aspect-video overflow-hidden rounded-t-xl">
          {React.Children.map(children, (child) => {
            if (
              React.isValidElement<React.ImgHTMLAttributes<HTMLImageElement>>(
                child
              ) &&
              child.type === "img"
            ) {
              return React.cloneElement(child, {
                className:
                  "absolute h-full w-full object-cover brightness-100 transition duration-300 ease-out group-hover:brightness-110 border border-slate-900/10 rounded-t-2xl",
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 p-6">
        <H5 className="text-slate-900">{title}</H5>
        <P size="xs" className="text-slate-900">
          {content}
        </P>
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
        <P size="lg" className="text-slate-500">
          {uptitle}
        </P>
      )}
      <H1 from={from} to={to}>
        {title}
      </H1>
      {subtitle && (
        <P size="lg" className="text-white">
          {subtitle}
        </P>
      )}
      {hasCTA && (
        <div>
          <Link href="/pricing" shallow={true}>
            <Button
              variant="primary"
              size="md"
              label="Get started"
              icon={RocketIcon}
            />
          </Link>
        </div>
      )}
    </div>
  </Grid>
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
      "flex h-full flex-col gap-6 rounded-3xl border bg-gradient-to-br py-8",
      from,
      to,
      border
    )}
  >
    <div className="flex flex-1 flex-col gap-6 px-8">
      <H3 className="text-slate-800">{"Dust for " + title}</H3>
      <div className="flex flex-col gap-2">
        <H2 className="max-w-[600px] text-white">{subtitle}</H2>
        <P size="md" className="max-w-[720px] text-slate-600">
          {description}
        </P>
      </div>
      <div className="w-full text-center">
        <Link href={href} shallow={true} className="block w-full">
          <Button
            label={"Discover Dust for " + title}
            variant="tertiary"
            size="md"
            icon={ArrowRightIcon}
            className="max-w-full"
          />
        </Link>
      </div>
    </div>
    <Carousel className="w-full" isLooping={true}>
      <CarouselContent>
        {assistants.map((block, index) => (
          <CarouselItem key={index} className="basis-1/2 px-8 md:basis-1/3">
            <SolutionSectionAssistantBlock {...block} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="flex w-full flex-row items-center justify-end gap-3 px-8">
        <CarouselPrevious label="previous" />
        <CarouselNext label="next" />
      </div>
    </Carousel>
  </div>
);
