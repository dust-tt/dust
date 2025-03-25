import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { FC } from "react";

import { Grid, H1, P } from "@app/components/home/ContentComponents";

interface Visual {
  src: string;
  alt: string;
  depth: number;
}

interface HeroSectionProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  fromColor: string;
  toColor: string;
  visuals: Visual[];
  ctaButtons?: {
    primary?: {
      label: string;
      href: string;
    };
    secondary?: {
      label: string;
      href: string;
    };
  };
}

export const HeroSection: FC<HeroSectionProps> = ({
  uptitle,
  title,
  description,
  visuals,
  ctaButtons,
}) => {
  const MainVisual = () => (
    <Hover3D depth={-40} perspective={1000} className="relative">
      {visuals.map((visual, index) => (
        <Div3D
          key={index}
          depth={visual.depth}
          className={index > 0 ? "absolute top-0" : ""}
        >
          <img src={visual.src} alt={visual.alt} />
        </Div3D>
      ))}
    </Hover3D>
  );

  return (
    <div className="container flex w-full flex-col py-6">
      <Grid>
        <div className="col-span-12 mx-auto flex flex-col justify-center py-4 sm:max-w-[100%] md:max-w-[90%] lg:col-span-6 lg:col-start-1 lg:h-[100%] lg:max-w-[100%] 2xl:col-span-6">
          <P size="lg" className="text-muted-foreground">
            Dust for {uptitle}
          </P>
          <H1>{title}</H1>
          <P size="lg" className="pb-6">
            {description}
          </P>
          {ctaButtons && (
            <div className="flex gap-4">
              {ctaButtons.primary && (
                <Link href={ctaButtons.primary.href} shallow={true}>
                  <Button
                    variant="highlight"
                    size="md"
                    label={ctaButtons.primary.label}
                    icon={RocketIcon}
                  />
                </Link>
              )}
              {ctaButtons.secondary && (
                <Link href={ctaButtons.secondary.href} shallow={true}>
                  <Button
                    variant="outline"
                    size="md"
                    label={ctaButtons.secondary.label}
                  />
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="col-span-12 mx-auto hidden px-4 py-4 pt-12 sm:max-w-[100%] md:max-w-[90%] lg:col-span-6 lg:col-start-7 lg:block lg:h-[100%] lg:max-w-[100%] 2xl:col-span-6">
          <div className="flex h-full w-full items-center justify-center xl:px-8">
            <MainVisual />
          </div>
        </div>
      </Grid>
    </div>
  );
};
