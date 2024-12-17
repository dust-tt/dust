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
    <div className={classNames("flex flex-col gap-12", className)}>
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
        "flex w-full flex-col overflow-hidden rounded-2xl bg-slate-200 drop-shadow-xl",
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
          <H5 className="line-clamp-2 text-slate-900">{title}</H5>
          <P size="xs" className="line-clamp-3 text-slate-900">
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
              variant="highlight"
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

interface MetricComponentProps {
  metrics: {
    value: string;
    description: ReactNode;
  }[];
  from: string;
  to: string;
}

export const MetricComponent = ({
  metrics,
  from,
  to,
}: MetricComponentProps) => (
  <>
    {metrics.map((metric, index) => (
      <div
        key={index}
        className="col-span-6 flex flex-col items-center gap-4 py-12 text-center"
      >
        <H1 from={from} to={to}>
          {metric.value}
        </H1>
        <P size="lg" className="max-w-[400px] text-white">
          {metric.description}
        </P>
      </div>
    ))}
  </>
);

interface QuoteProps {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

export const Quote = ({ quote, logo, name, title }: QuoteProps) => (
  <div className="col-span-12 flex flex-col py-20 md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3">
    <div className="flex flex-col items-center text-center font-objektiv text-xl italic text-white sm:text-2xl lg:text-3xl">
      &ldquo; {quote} &rdquo;
    </div>
    <div className="flex justify-center pt-8">
      <div className="flex items-center justify-center">
        <Image src={logo} width={200} height={48} alt="Malt Logo" />
        <P size="md" className="text-primary-400">
          <Strong>
            <span className="text-pink-300">{name}</span>
          </Strong>
          <br />
          {title}
        </P>
      </div>
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
      <div className="w-full text-left">
        <Link href={href} shallow={true} className="inline-block">
          <Button
            label={"Discover Dust for " + title}
            variant="outline"
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
        <CarouselPrevious />
        <CarouselNext />
      </div>
    </Carousel>
  </div>
);
