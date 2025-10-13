import { H1, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

interface TestimonialSectionProps {
  quote: string;
  author: {
    name: string;
    title: string;
  };
  company: {
    logo: string;
    alt: string;
  };
  bgColor?: string;
  textColor?: string;
}

export function TestimonialSection({
  quote,
  author,
  company,
  bgColor = "bg-green-600",
  textColor = "text-white",
}: TestimonialSectionProps) {
  return (
    <div className={classNames("rounded-xl py-8 md:py-16", bgColor)}>
      <div className="container mx-auto px-6 md:px-8 lg:px-12">
        <div className="flex flex-col justify-center">
          <H1
            className={classNames(
              "mb-10 text-3xl !font-normal sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl",
              textColor
            )}
          >
            "{quote}"
          </H1>
          <div className="flex flex-col gap-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div>
              <P size="lg" className={classNames("font-medium", textColor)}>
                {author.name}
              </P>
              <P
                size="lg"
                className={
                  textColor === "text-white"
                    ? "text-green-100"
                    : "text-muted-foreground"
                }
              >
                {author.title}
              </P>
            </div>
            <div className="flex sm:flex-shrink-0 sm:justify-end">
              <img
                src={company.logo}
                alt={company.alt}
                className="h-16 w-auto sm:h-20"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
