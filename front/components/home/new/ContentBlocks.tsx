import type { ReactNode } from "react";
import React from "react";

import {
  Grid,
  H1,
  H3,
  H5,
  P,
} from "@app/components/home/new/ContentComponents";
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
}

export const HeaderContentBlock = ({
  title,
  subtitle,
  uptitle,
  from,
  to,
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
    </div>
  </Grid>
);
