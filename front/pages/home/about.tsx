import {
  ArrowRightIcon,
  Button,
  Div3D,
  GithubIcon,
  Hover3D,
  Icon,
  LinkedinIcon,
  RocketIcon,
  Separator,
} from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import {
  Grid,
  H1,
  H2,
  H3,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { classNames } from "@app/lib/utils";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.icosahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const PEOPLE: Record<
  string,
  {
    name: string;
    title: string;
    image: string;
    linkedIn: string | null;
    github: string | null;
  }
> = {
  spolu: {
    name: "Stanislas Polu",
    title: "Co-founder, CTO",
    image: "https://avatars.githubusercontent.com/u/15067",
    linkedIn: "https://www.linkedin.com/in/spolu",
    github: "https://github.com/spolu",
  },
  gabhubert: {
    name: "Gabriel Hubert",
    title: "Co-founder, CEO",
    image: "https://avatars.githubusercontent.com/u/998689",
    linkedIn: "https://linkedin.com/in/gabhubert",
    github: "https://github.com/gabhubert",
  },
};

const Person = ({ handle }: { handle: string }) => {
  const person = PEOPLE[handle];
  return (
    <div className="flex flex-row items-start gap-2">
      <img
        src={person.image}
        alt={person.name}
        className="mt-1 h-8 w-8 rounded-xl"
      />
      <div className="flex flex-col gap-0">
        <div className="font-bold text-white">{person.name}</div>
        <div className="text-sm text-muted-foreground">{person.title}</div>
        <div className="flex flex-row items-start gap-1 pt-1">
          {person.linkedIn && (
            <a href={person.linkedIn} target="_blank">
              <Icon
                size="xs"
                visual={LinkedinIcon}
                className="text-slate-400"
              />
            </a>
          )}
          {person.github && (
            <a href={person.github} target="_blank">
              <Icon size="xs" visual={GithubIcon} className="text-slate-400" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const VideoPlayer = () => {
  return (
    <div className="relative w-full pt-[56.25%]">
      {" "}
      {/* 16:9 aspect ratio */}
      <iframe
        src="https://fast.wistia.net/embed/iframe/5rngajfoj9?seo=true&videoFoam=true&autoPlay=true"
        title="Dust product tour"
        allow="autoplay; fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full rounded-lg"
      ></iframe>
    </div>
  );
};

export default function About() {
  return (
    <>
      <div className="container flex w-full flex-col gap-16 px-6 md:gap-24">
        <div
          className={classNames(
            "flex w-full flex-col justify-end gap-4 pt-12 sm:pt-12 lg:pt-24"
          )}
        >
          <P size="lg" className="text-center text-muted-foreground">
            About us
          </P>
          <div className="flex flex-row justify-center">
            <H1 className="max-w-2xl text-center text-red-400">
              Our mission is to transform how work gets done
            </H1>
          </div>
          <div className="flex flex-row justify-center">
            <div className="max-w-4xl">
              <img src="/static/landing/about/about_visual.png" />
            </div>
          </div>
        </div>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-16 xl:flex-row xl:items-start",
              "col-span-10 col-start-2"
            )}
          >
            <div className="flex max-w-lg flex-row">
              <H2 className="text-white">
                We're crafting the AI operating system for enterprises
              </H2>
            </div>
            <div className="flex max-w-xl flex-col gap-2">
              <P>
                We're building Dust to serve as the operating system for
                AI-driven companies.
              </P>
              <P>
                Like Windows provided universal UI primitives that made
                applications more productive, we proviude universal AI
                primitives that make enterprise workflows more intelligent.
              </P>
              <P>
                Our infrastructure connects models to company data, turning raw
                AI capabilities into agents that do real work. Success isn't
                about training bigger models - it's about connecting them to how
                work actually happens. When we're done, work won't be the same.
              </P>
            </div>
          </div>
        </Grid>

        <Grid>
          <Separator className="col-span-10 col-start-2 bg-slate-700" />
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col items-start gap-6",
              "col-span-10 col-start-2"
            )}
          >
            <H2 className="text-white">Our operating principles</H2>
            <div className="flex flex-col gap-2">
              <P>
                Our{" "}
                <Link
                  className="underline"
                  href="https://docs.google.com/document/d/1YIRfpUvh8hHzt-TnvAn1qHnz_F65b-OC8o_1b1kg8IU/edit?usp=sharing"
                  target="_blank"
                >
                  operating principles
                </Link>{" "}
                are philosophical razors that we use daily.
              </P>
            </div>
            <div className="flex flex-col">
              <P>
                <Strong>We have ambition and we're optimistic.</Strong> When
                we're done, work won't be the same. Think R2D2, not Skynet.
              </P>
              <P>
                <Strong>We move fast.</Strong> See it, say it, solve it. We edit
                the company, default to action and bend the arc of our industry.
              </P>
              <P>
                <Strong>We operate with greatness.</Strong> We put users first.
                We apply 80/20 except when 20/80 is crucial.
              </P>
              <P>
                <Strong>We act as one team.</Strong> High-trust, high-energy,
                low-ego. We build serious things without taking ourselves too
                serioulsy.
              </P>
            </div>

            <div className="pt-4">
              <Link href="/jobs" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="We're hiring"
                  icon={RocketIcon}
                />
              </Link>
            </div>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col items-start gap-6",
              "col-span-10 col-start-2"
            )}
          >
            <VideoPlayer />
          </div>
        </Grid>

        <Grid>
          {Object.keys(PEOPLE).map((handle, i) => (
            <div
              key={handle}
              className={classNames(
                "col-span-2",
                i % 5 === 0 ? "col-start-2" : ""
              )}
            >
              <Person handle={handle} />
            </div>
          ))}
        </Grid>
      </div>
    </>
  );
}

About.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
