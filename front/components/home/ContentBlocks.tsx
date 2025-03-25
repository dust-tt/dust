import { ArrowRightSIcon, Button, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";
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

import type { ROIProps } from "./content/Solutions/configs/utils";

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
      <div className="ml-[10%] pr-[20%] lg:m-0 lg:pr-[28%]">
        {children ? children : null}
      </div>
      <div className="flex flex-col px-0 py-6">
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
        "flex h-full w-full flex-col overflow-hidden rounded-2xl bg-muted-background",
        "group transition duration-300 ease-out",
        "hover:bg-primary-100"
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
                  "border border-border rounded-t-2xl"
                ),
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col p-6">
        <div className="flex flex-col gap-2">
          <H5 className="line-clamp-2 text-foreground">{title}</H5>
          <P size="xs" className="line-clamp-3 text-foreground">
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
        <P size="lg" className="text-muted-foreground">
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
  from: string;
  to: string;
}

export const MetricSection = ({ metrics }: MetricComponentProps) => (
  <div
    className={classNames(
      "grid w-full grid-cols-1 gap-8 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-2",
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
        <H1>{metric.value}</H1>

        <div className="flex flex-col items-center">
          <P size="lg" className="max-w-[400px] text-foreground">
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
  <div className="col-span-12 flex flex-col rounded-4xl pb-2 pt-4 lg:col-span-10 lg:col-start-2">
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
          className="text-sm text-primary-400 xs:text-left xs:text-base sm:text-lg md:text-lg"
        >
          <Strong>
            <span className="text-hunter-green">{name}</span>
          </Strong>
          <br /> {title}
        </P>
      </div>
    </div>
    <div className="lg:copy-2xl copy-base flex flex-col items-center rounded-4xl p-4 text-center italic text-foreground xs:copy-lg md:copy-xl sm:text-xl">
      &ldquo; {quote} &rdquo;
    </div>
  </div>
);

interface CarousselContentBlockProps {
  title: ReactNode;
  from: string;
  to: string;
  border: string;
  href: string;
  bulletPoints: string[];
  image: string;
  quote?: QuoteProps;
  roi?: ROIProps;
}

export const CarousselContentBlock = ({
  title,
  from,
  to,
  border,
  href,
  bulletPoints,
  image,
  quote,
  roi,
}: CarousselContentBlockProps) => {
  return (
    <div
      className={classNames(
        "flex flex-col rounded-3xl border bg-gradient-to-br py-6 md:h-full lg:py-7",
        from,
        to,
        border
      )}
    >
      <div className="flex flex-col gap-8 px-4 sm:px-6 md:px-8 lg:h-full lg:flex-row lg:gap-12">
        <div className="flex flex-col lg:h-full lg:w-1/2">
          <div className="mb-2 lg:mb-4">
            <H2 className="mb-4 text-slate-900">{title}</H2>

            {bulletPoints && (
              <ul className="flex list-none flex-col gap-3">
                {bulletPoints.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 pt-1">
                      <ArrowRightSIcon className="h-4 w-4 flex-shrink-0 text-slate-900" />
                    </div>
                    <P
                      size="md"
                      className="text-sm text-slate-800 md:text-base"
                    >
                      {feature}
                    </P>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Mobile-only image - between bullet points and quote */}
          <div className="my-6 lg:hidden">
            <div className="flex items-center justify-center">
              <div className="w-full max-w-md">
                <Image
                  src={image}
                  alt={title as string}
                  width={1200}
                  height={630}
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
          {/* Quote and ROI section */}
          <div className="mt-2 flex w-full flex-col gap-4 lg:mt-6 lg:flex-grow">
            {" "}
            {/* flex-grow only on lg */}
            {quote && (
              <>
                <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-br from-white/80 to-white/40 p-4 shadow-sm backdrop-blur-sm">
                  <P
                    size="sm"
                    className="w-full text-xs italic text-slate-800 md:text-sm"
                  >
                    "{quote?.quote}"
                  </P>
                  <div className="flex items-center gap-3">
                    {quote.logo ? (
                      <div className="flex h-10 w-20 overflow-hidden rounded-full bg-slate-950 shadow-md">
                        <Image
                          src={quote.logo}
                          height={40}
                          width={120}
                          alt={`${quote.name} logo`}
                          className="h-10 w-auto rounded-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 overflow-hidden rounded-full bg-blue-500 shadow-md">
                        <div className="flex h-full w-full items-center justify-center text-white">
                          {quote.name.charAt(0)}
                        </div>
                      </div>
                    )}
                    <div>
                      <P
                        size="sm"
                        className="text-xs font-bold text-slate-800 md:text-sm"
                      >
                        {quote.name}
                      </P>
                      <P size="xs" className="text-xs text-slate-700">
                        {quote.title}
                      </P>
                    </div>
                  </div>
                </div>
              </>
            )}
            {roi && (
              <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-br from-white/80 to-white/40 p-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-24 overflow-hidden rounded-full bg-slate-950 shadow-md">
                    <Image
                      src={roi.logo}
                      height={48}
                      width={120}
                      alt={`${roi.subtitle} logo`}
                      className="h-12 w-auto object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <H2 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-4xl font-bold text-slate-900 text-transparent">
                      {roi.number}
                    </H2>
                    <P
                      size="md"
                      className="text-sm font-medium text-slate-800 md:text-base"
                    >
                      {roi.subtitle}
                    </P>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Button */}
          <div className="mt-4">
            {" "}
            {/* mt-auto only on lg */}
            <Link href={href} shallow={true}>
              <Button
                label={`Learn more →`}
                variant="outline"
                size="md"
                className="bg-white/80 hover:bg-white"
              />
            </Link>
          </div>
        </div>
        {/* Desktop-only image - right column */}
        <div className="hidden items-center justify-center lg:flex lg:w-3/5">
          <div className="w-full max-w-md lg:max-w-2xl">
            <Image
              src={image}
              alt={title as string}
              width={1200}
              height={630}
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export function ContentBlock({
  title,
  description,
  image,
  imageAlt,
  page = "default",
}: {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  page?: string;
}) {
  // ... existing code ...
}
