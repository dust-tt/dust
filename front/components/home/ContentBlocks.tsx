import { ArrowRightSIcon, Button, RocketIcon } from "@dust-tt/sparkle";
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
        "flex flex-col gap-2 overflow-hidden rounded-2xl bg-muted-background",
        className
      )}
    >
      <div className="flex aspect-video items-center justify-center bg-primary-800 p-4">
        <div className="max-w-[400px]">{children ? children : null}</div>
      </div>
      <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
        <H3 className="text-foreground" mono>
          {title}
        </H3>
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
  style?: React.CSSProperties;
}

export const BlogBlock: React.FC<BlogBlockProps> = ({
  children,
  title,
  content,
  href,
  className = "",
  style,
}) => {
  return (
    <a
      href={href}
      target="_blank"
      className={classNames(
        className,
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-muted-background",
        "group transition duration-300 ease-out",
        "hover:bg-primary-100"
      )}
      style={style}
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
                style: { borderRadius: 0 },
              });
            }
            return child;
          })}
        </div>
      ) : null}
      <div className="flex flex-col p-8">
        <div className="flex flex-col gap-2">
          <H5 className="line-clamp-2 text-foreground" mono>
            {title}
          </H5>
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
        <P
          size="lg"
          className="text-muted-foreground dark:text-muted-foreground-night"
        >
          {uptitle}
        </P>
      )}
      <H1>{title}</H1>
      {subtitle && (
        <P size="lg" className="text-white dark:text-black">
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

// Collection of all quotes from across the site
export const AllQuotes: QuoteProps[] = [
  {
    quote:
      "Dust is the most impactful software we've adopted since building Clay. It continuously gets smarter, turning hours of documentation search into instant, cited answers—letting our team spend less time searching and more time closing deals.",
    name: "Everett Berry",
    title: "Head of GTM Engineering at Clay",
    logo: "/static/landing/logos/color/clay.png",
  },
  {
    quote:
      "Thanks to what we've implemented at Alan, in less than three question iterations, I can craft the perfect SQL query I need and get the context behind it.",
    name: "Vincent Delagabbe",
    title: "Software Engineer at Alan",
    logo: "/static/landing/logos/color/alan.png",
  },
  {
    quote:
      "Dust transformed our privacy reviews. It handles compliance checks, suggests improvements, and drafts communications. It both cuts our review time and helps pressure-test our legal interpretations.",
    name: "Thomas Adhumeau",
    title: "Chief Privacy Officer at Didomi",
    logo: "/static/landing/logos/color/didomi.png",
  },
  {
    quote:
      "It became evident that Dust could serve as a knowledgeable buddy for all staff, enhancing productivity whether you're newly onboarded or a veteran team member.",
    name: "Boris Lipiainen",
    title: "Chief Product and Technology Officer at Kyriba",
    logo: "/static/landing/logos/color/kyriba.png",
  },
  {
    quote:
      "Dust is not just a tool - it's like having an extra team member who knows your brand voice, can handle recurring tasks, and helps you tackle new challenges. I couldn't do half of my job without it, especially with tight deadlines and a small team.",
    name: "Valentine Chelius",
    title: "Head of Marketing at Fleet",
    logo: "/static/landing/logos/color/fleet.png",
  },
  {
    quote:
      "The Dust platform is more than just a tool for post-ideation; it's a catalyst for innovation, stimulating idea generation as employees engage with it.",
    name: "Boris Lipiainen",
    title: "Chief Product and Technology Officer at Kyriba",
    logo: "/static/landing/logos/color/kyriba.png",
  },
  {
    quote:
      "It's really become a reflex now to ask a Dust agent. With just two keystrokes, it instantly surfaces exactly the context I need - whether from code, documentation, or overlooked team discussions.",
    name: "Vincent Delagabbe",
    title: "Software Engineer at Alan",
    logo: "/static/landing/logos/color/alan.png",
  },
  {
    quote:
      "We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds.",
    name: "Anaïs Ghelfi",
    title: "Head of Data Platform at Malt",
    logo: "/static/landing/logos/color/malt.png",
  },
  {
    quote:
      "We asked ourselves for years: what if your team had 20% more time? Dust has made it possible, empowering our employees to work smarter, innovate, and push boundaries.",
    name: "Matthieu Birach",
    title: "Chief People Officer at Doctolib",
    logo: "/static/landing/logos/color/doctolib.png",
  },
];

// Single quote card component
const QuoteCard = ({ quote, logo, name, title }: QuoteProps) => (
  <div className="flex h-full w-full flex-col rounded-lg bg-gray-50 p-4 sm:rounded-xl sm:p-5 md:p-6">
    <div className="font-objektiv sm:line-clamp-7 mb-4 line-clamp-5 flex flex-col items-start text-left text-base font-normal text-gray-900 sm:text-base md:text-lg">
      "{quote}"
    </div>
    <div className="mt-auto flex items-center justify-between">
      <div className="mr-2 flex flex-col">
        <P size="sm" className="line-clamp-1 font-semibold text-gray-900">
          {name}
        </P>
        <P size="xs" className="line-clamp-1 text-gray-600">
          {title}
        </P>
      </div>
      <Image
        src={logo}
        width={120}
        height={48}
        alt="Company Logo"
        className="ml-2 h-12 w-auto sm:ml-3 sm:h-12"
      />
    </div>
  </div>
);

export const QuoteSection = ({ quote, logo, name, title }: QuoteProps) => {
  // Create array of quotes with the provided quote first
  const currentQuote = { quote, logo, name, title };
  const otherQuotes = AllQuotes.filter(
    (q) => q.quote !== quote || q.name !== name || q.title !== title
  );
  const quotes = [currentQuote, ...otherQuotes];

  return (
    <div className="w-full">
      <Carousel className="w-full" opts={{ align: "start" }} isLooping={true}>
        <div className="mb-2 flex items-center justify-between sm:mb-4">
          <H2>Testimonials</H2>
          <div className="flex gap-1.5 sm:gap-4">
            <CarouselPrevious
              size="sm"
              className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10"
            />
            <CarouselNext
              size="sm"
              className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10"
            />
          </div>
        </div>
        <CarouselContent className="h-[250px] sm:h-[280px]">
          {quotes.map((q, index) => (
            <CarouselItem
              key={index}
              className="h-full basis-full pl-1 sm:basis-1/2 sm:pl-2 md:pl-4 lg:basis-1/3"
            >
              <div className="h-full w-full pr-1 sm:pr-2 md:pr-4">
                <QuoteCard {...q} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
};

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
            <H2 className="mb-4 text-gray-900">{title}</H2>

            {bulletPoints && (
              <ul className="flex list-none flex-col gap-3">
                {bulletPoints.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 pt-1">
                      <ArrowRightSIcon className="h-4 w-4 flex-shrink-0 text-gray-900" />
                    </div>
                    <P size="md" className="text-sm text-gray-800 md:text-base">
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
                    className="w-full text-xs italic text-gray-800 md:text-sm"
                  >
                    "{quote?.quote}"
                  </P>
                  <div className="flex items-center gap-3">
                    {quote.logo ? (
                      <div className="flex h-10 w-20 overflow-hidden rounded-full bg-gray-950 shadow-md">
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
                        className="text-xs font-bold text-gray-800 md:text-sm"
                      >
                        {quote.name}
                      </P>
                      <P size="xs" className="text-xs text-gray-700">
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
                  <div className="flex h-12 w-24 overflow-hidden rounded-full bg-gray-950 shadow-md">
                    <Image
                      src={roi.logo}
                      height={48}
                      width={120}
                      alt={`${roi.subtitle} logo`}
                      className="h-12 w-auto object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <H2 className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-4xl font-bold text-gray-900 text-transparent">
                      {roi.number}
                    </H2>
                    <P
                      size="md"
                      className="text-sm font-medium text-gray-800 md:text-base"
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

interface ImgContentProps {
  images: {
    src: string;
    alt?: string;
  }[];
}

export const ImgContent: React.FC<ImgContentProps> = ({ images }) => {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative flex h-full w-full max-w-[240px] items-center justify-center">
        {images.map((image, index) => (
          <img
            key={index}
            src={image.src}
            alt={image.alt || `Image ${index + 1}`}
            className={classNames(
              "max-h-[120px] max-w-[160px] object-contain",
              index === 0
                ? ""
                : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
            )}
            style={{
              zIndex: images.length - index,
            }}
          />
        ))}
      </div>
    </div>
  );
};
