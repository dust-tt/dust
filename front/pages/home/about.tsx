import {
  ArrowRightIcon,
  Button,
  Div3D,
  GithubIcon,
  Hover3D,
  Icon,
  LinkedinIcon,
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

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.icosahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const PEOPLE: Record<
  string, // The handle is the prefix of the email address
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
  fontanierh: {
    name: "Henry Fontanier",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/14199823",
    linkedIn: "https://www.linkedin.com/in/hfontanier/",
    github: "https://github.com/fontanierh",
  },
  pr: {
    name: "Philippe Rolet",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/5437393",
    linkedIn: "https://www.linkedin.com/in/philipperolet/",
    github: "https://github.com/philipperolet",
  },
  ed: {
    name: "Edouard Wautier",
    title: "Principal Designer",
    image: "https://avatars.githubusercontent.com/u/4435185",
    linkedIn: "https://www.linkedin.com/in/edouardwautier/",
    github: "https://github.com/Duncid",
  },
  popdaph: {
    name: "Daphné Popin",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/3803406",
    linkedIn: "https://www.linkedin.com/in/popdaph/",
    github: "https://github.com/popdaph",
  },
  yutcam: {
    name: "Pauline Pham",
    title: "Operations",
    image: "https://avatars.githubusercontent.com/u/33726902",
    linkedIn: "https://www.linkedin.com/in/pauline-pham1",
    github: "https://github.com/Yutcam",
  },
  flvndvd: {
    name: "Flavien David",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/7428970",
    linkedIn: "https://www.linkedin.com/in/flavien-david/",
    github: "https://github.com/flvndvd",
  },
  nchinot: {
    name: "Nicolas Chinot",
    title: "US GM",
    image: "https://avatars.githubusercontent.com/u/13472346",
    linkedIn: "https://www.linkedin.com/in/nicolaschinot/",
    github: "https://github.com/nchinot",
  },
  albandum: {
    name: "Alban Dumouilla",
    title: "Acceleration Engineer",
    image: "https://avatars.githubusercontent.com/u/1189312?v=4",
    github: "https://github.com/albandum",
    linkedIn: "https://www.linkedin.com/in/albandumouilla",
  },
  clementb: {
    name: "Clément Bruneau",
    title: "Sales",
    image: "https://avatars.githubusercontent.com/u/120678252?v=4",
    github: "https://github.com/clmrn",
    linkedIn: "https://www.linkedin.com/in/bruneauclement",
  },
  tmartin: {
    name: "Thibault Martin",
    title: "GTM & Operations",
    image: "https://avatars.githubusercontent.com/u/168569391?v=4",
    github: "https://github.com/thib-martin",
    linkedIn: "https://www.linkedin.com/in/thibault-martin-27b19b5a/",
  },
  jbelveze: {
    name: "Jules Belveze",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/32683010",
    github: "https://github.com/JulesBelveze",
    linkedIn: "https://www.linkedin.com/in/jules-belveze",
  },
  tdraier: {
    name: "Thomas Draier",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/729255",
    linkedIn: "https://www.linkedin.com/in/tdraier/",
    github: "https://github.com/tdraier",
  },
  fraggle: {
    name: "Sébastien Flory",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/24419?v=4",
    github: "https://github.com/Fraggle",
    linkedIn: "https://www.linkedin.com/in/fraggle/",
  },
  adugre: {
    name: "Adèle Dugré",
    title: "EMEA Customer Success",
    image: "https://avatars.githubusercontent.com/u/180963192",
    linkedIn: "https://www.linkedin.com/in/ad%C3%A8le-dugr%C3%A9-7484a120/",
    github: "https://github.com/Adugre",
  },
  atchoi: {
    name: "Aubin Tchoi",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/60398825",
    github: "https://github.com/aubin-tchoi",
    linkedIn: "https://www.linkedin.com/in/aubin-tchoi",
  },
  apinot: {
    name: "Alexandre Pinot",
    title: "Product Designer",
    image: "https://avatars.githubusercontent.com/u/32997243?v=4",
    github: "https://github.com/pinotalexandre",
    linkedIn: "https://www.linkedin.com/in/pinotalexandre/",
  },
  ahammour: {
    name: "Abboud Hammour",
    title: "Solutions Engineer",
    image: "https://avatars.githubusercontent.com/u/170936020?v=4",
    github: "https://github.com/ahammour",
    linkedIn: "https://www.linkedin.com/in/abboud-hammour/",
  },
  adeltombe: {
    name: "Amelie Deltombe",
    title: "Marketing",
    image: "https://avatars.githubusercontent.com/u/183381801?v=4",
    github: "https://github.com/ameliedrhub",
    linkedIn: "https://www.linkedin.com/in/ameliedeltombe/",
  },
  tvanneufville: {
    name: "Theo Vanneufville",
    title: "Operations",
    image: "https://avatars.githubusercontent.com/u/190379594?v=4",
    github: "https://github.com/theo-vanneufville",
    linkedIn: "https://www.linkedin.com/in/th%C3%A9o-vanneufville-aab050193/",
  },
  kevin: {
    name: "Kevin Straszburger",
    title: "Community",
    image: "https://avatars.githubusercontent.com/u/7229871?v=4",
    github: "https://github.com/k7vin",
    linkedIn: "https://www.linkedin.com/in/kevinstraszburger/",
  },
  frank: {
    name: "Frank Aloia",
    title: "Acceleration Engineer",
    image: "https://avatars.githubusercontent.com/u/201725577",
    github: "https://github.com/frankaloia",
    linkedIn: "https://www.linkedin.com/in/frank-aloia-39907a12b/",
  },
  gina: {
    name: "Gina Kabasakalis",
    title: "Go To Market",
    image: "https://ca.slack-edge.com/T050RH73H9P-U08FS7RK45B-0d9a6f5b000d-512",
    linkedIn: "https://www.linkedin.com/in/ginakabasakalis/",
    github: "https://github.com/gina-dust/",
  },
  adrsimon: {
    name: "Adrien Simon",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/99071153",
    github: "https://github.com/adrsimon",
    linkedIn: "https://www.linkedin.com/in/adrsimon/",
  },
  stephen: {
    name: "Stephen Bronnec",
    title: "Acceleration Engineer",
    image: "https://avatars.githubusercontent.com/u/11921176?v=4",
    github: "https://github.com/FlagBenett",
    linkedIn: "https://www.linkedin.com/in/stephen-bronnec-3033a02b/",
  },
  ykmsd: {
    name: "Yuka Masuda",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/3702771?v=4",
    github: "https://github.com/ykmsd",
    linkedIn: "https://www.linkedin.com/in/ykmsd/",
  },
  victor: {
    name: "Victor Pery",
    title: "Account Executive",
    image: "https://avatars.githubusercontent.com/u/205647687?v=4",
    github: "https://github.com/victorpery",
    linkedIn: "https://www.linkedin.com/in/victor-pery/",
  },
  wendy: {
    name: "Wendy Zhao",
    title: "Customer Education",
    image: "https://avatars.githubusercontent.com/u/205610550?v=4",
    github: "https://github.com/atrwendy",
    linkedIn: "https://www.linkedin.com/in/wendyzhao07/",
  },
  gaelle: {
    name: "Gaëlle Caplier",
    title: "Customer Success",
    image: "https://avatars.githubusercontent.com/u/49072037?v=4",
    github: "https://github.com/gcaplier",
    linkedIn: "https://www.linkedin.com/in/gcaplier/",
  },
  lena: {
    name: "Léna Caloud",
    title: "Customer Success",
    image: "https://ca.slack-edge.com/T050RH73H9P-U08S29YC36H-b53f68fd8f87-512",
    github: "https://github.com/lcaloud",
    linkedIn: "https://www.linkedin.com/in/lenacaloud/",
  },
  ben: {
    name: "Benjamin Toueg",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/498190?v=4",
    github: "https://github.com/btoueg",
    linkedIn: "https://www.linkedin.com/in/toueg",
  },
  david: {
    name: "David Ebbo",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/556238?v=4",
    github: "https://github.com/davidebbo",
    linkedIn: "https://www.linkedin.com/in/davidebbo",
  },
  edouard: {
    name: "Edouard Villette",
    title: "Senior Account Executive",
    image: "https://avatars.githubusercontent.com/u/215458058?v=4",
    github: "https://github.com/TrismoEd",
    linkedIn: "https://www.linkedin.com/in/edouard-villette",
  },
  vince: {
    name: "Vince Sarkisian",
    title: "Solutions Engineer",
    image: "https://avatars.githubusercontent.com/u/1455646?v=4",
    github: "https://github.com/vincesarkisian",
    linkedIn: "https://www.linkedin.com/in/vincesarkisian/",
  },
  louis: {
    name: "Louis Caulet",
    title: "Enterprise Account Executive",
    image: "https://ca.slack-edge.com/T050RH73H9P-U093VA5K3JQ-6e18517d0b48-512",
    github: "https://github.com/louiscaulet",
    linkedIn: "https://www.linkedin.com/in/louiscaulet",
  },
  faateh: {
    name: "Faateh Dhillon",
    title: "Senior Account Executive",
    image: "https://ca.slack-edge.com/T050RH73H9P-U093VA8B7E0-e078a8e04a44-512",
    github: "https://github.com/faateh-dust",
    linkedIn: "https://www.linkedin.com/in/faatehalidhillon",
  },
  nicole: {
    name: "Nicole Kreider",
    title: "Account Executive",
    image: "https://ca.slack-edge.com/T050RH73H9P-U096T3FG7HU-4967c6b16ae2-512",
    github: "https://github.com/nkreider-dot",
    linkedIn: "https://www.linkedin.com/in/nkreider",
  },
  lauriane: {
    name: "Lauriane Paour",
    title: "Solution Engineer",
    image: "https://ca.slack-edge.com/T050RH73H9P-U096NGVETPD-0d8f0affddf6-512",
    linkedIn: "https://www.linkedin.com/in/lauriane-paour-152760106/",
    github: null,
  },
  landry: {
    name: "Landry Monga",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/23080211?v=4",
    github: "https://github.com/lvndry",
    linkedIn: "https://www.linkedin.com/in/landry-monga",
  },
  come: {
    name: "Côme Lucien-Brun",
    title: "Account Executive",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09ATL7UVB5-873d7e42eb96-512",
    github: "https://github.com/come-lb",
    linkedIn: "https://www.linkedin.com/in/comelb",
  },
  theog: {
    name: "Théo Gantzer",
    title: "Data",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09ATLHUB0B-6ab7143a82c5-512",
    linkedIn: "https://www.linkedin.com/in/theo-gantzer",
    github: "https://github.com/theogz",
  },
  okal: {
    name: "Okal Otieno",
    title: "Solution Engineer",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09ATLV5RNX-f840cb7fa121-512",
    linkedIn: "https://www.linkedin.com/in/okalotieno",
    github: "https://github.com/okal",
  },
  anas: {
    name: "Anas Lecaillon",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/31699174?v=4",
    linkedIn: "https://www.linkedin.com/in/anas-lecaillon",
    github: "https://github.com/anonx3247",
  },
  z: {
    name: "Zeïd Marouf",
    title: "Security Engineer",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09DVNRFDJL-bbc7ebca4159-512",
    linkedIn: "https://www.linkedin.com/in/zeidmarouf",
    github: "https://github.com/zmarouf",
  },
  rcs: {
    name: "Rémy-Christophe Schermesser",
    title: "Software Engineer",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09D77UR8S0-3af0e8ba603b-512",
    linkedIn: "https://www.linkedin.com/in/r%C3%A9my-christophe-s-0204834/",
    github: "https://github.com/ElPicador",
  },
  pierre: {
    name: "Pierre Milliotte",
    title: "Software Engineer",
    image: "https://avatars.githubusercontent.com/u/39985796?v=4",
    linkedIn: "https://www.linkedin.com/in/pierre-milliotte-664962a4/",
    github: "https://github.com/pmilliotte",
  },
  alex: {
    name: "Alexandre Casanova",
    title: "Enterprise Account Executive",
    image: "https://ca.slack-edge.com/T050RH73H9P-U09DVNHFS2C-9a2d6df66ced-512",
    linkedIn: "https://www.linkedin.com/in/alexandre-casanova-a89927a5/",
    github: "https://github.com/AlexandreCasa",
  },
  neyla: {
    name: "Neyla Belmaachi",
    title: "Business Development Representative",
    image:
      "https://media.licdn.com/dms/image/v2/D4D03AQFOta7Ao6aodg/profile-displayphoto-shrink_800_800/B4DZeCQlSRH4Ac-/0/1750237075055?e=1759968000&v=beta&t=HR_yS-qenHyqOcrwWAXiqO3czAvb0KGRDpja8sutgIs",
    linkedIn: "https://www.linkedin.com/in/neyla-belmaachi-4817b0166/",
    github: null,
  },
  leandre: {
    name: "Leandre Le Bizec",
    title: "Acceleration Engineer",
    image: "https://avatars.githubusercontent.com/u/95234460?v=4",
    linkedIn: "https://www.linkedin.com/in/leandre-lebizec/",
    github: "https://github.com/LeandreLeBizec",
  },
};

const Person = ({ handle }: { handle: string }) => {
  const person = PEOPLE[handle];
  return (
    <div className="flex flex-col gap-2 rounded-lg p-2 transition-colors hover:bg-gray-50 sm:flex-row">
      <img
        src={person.image}
        alt={person.name}
        className="h-12 w-12 rounded-xl sm:mt-1 sm:h-10 sm:w-10"
      />
      <div className="flex flex-col gap-1">
        <div className="copy-base text-foreground">
          <strong>{person.name}</strong>
        </div>
        <div className="copy-sm text-muted-foreground">{person.title}</div>
        <div className="flex flex-row gap-2 pt-1">
          {person.linkedIn && (
            <a href={person.linkedIn} target="_blank">
              <Icon
                size="xs"
                visual={LinkedinIcon}
                className="text-muted-foreground hover:text-foreground"
              />
            </a>
          )}
          {person.github && (
            <a href={person.github} target="_blank">
              <Icon
                size="xs"
                visual={GithubIcon}
                className="text-muted-foreground hover:text-foreground"
              />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const INVESTORS: { name: string; title: string }[] = [
  { name: "Konstantine Buhler", title: "Partner, Sequoia Capital" },
  { name: "Nat Friedman", title: "AI Grant" },
  { name: "Ross Fubini", title: "Partner, XYZ Ventures" },
  { name: "Pietro Bezza", title: "Partner, Connect Ventures" },
  { name: "Olivier Pomel", title: "CEO, Datadog" },
  { name: "Charles Gorintin", title: "CTO, Alan" },
  { name: "Matthieu Rouif", title: "CEO, Photoroom" },
  { name: "Eléonore Crespo", title: "CEO, Pigment" },
  { name: "Mathilde Colin", title: "CEO, Front" },
  { name: "Howie Liu", title: "CEO, Airtable" },
  { name: "Julien Chaumond", title: "CTO, HuggingFace" },
  { name: "Igor Babuschkin", title: "AI researcher" },
];

const Investor = ({ name, title }: { name: string; title: string }) => {
  return (
    <div className="flex flex-col gap-0">
      <div className="copy-base text-foreground">
        <strong>{name}</strong>
      </div>
      <div className="copy-sm text-muted-foreground">{title}</div>
    </div>
  );
};

const VideoPlayer = () => {
  return (
    <div className="relative w-full rounded-2xl pt-[56.20%]">
      {" "}
      {/* 16:9 aspect ratio */}
      <iframe
        src="https://fast.wistia.net/embed/iframe/5rngajfoj9?seo=true&videoFoam=true&autoPlay=true"
        title="Dust product tour"
        allow="autoplay; fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full overflow-hidden rounded-2xl"
      ></iframe>
    </div>
  );
};

export default function About() {
  return (
    <>
      <div className="container flex w-full flex-col gap-16 px-6 md:gap-24">
        <div
          className={classNames("flex w-full flex-col justify-end gap-4 pt-24")}
        >
          <H3 className="text-center text-muted-foreground">About us</H3>
          <div className="flex flex-row justify-center">
            <H1
              mono
              className="max-w-2xl text-center text-5xl font-medium md:text-6xl lg:text-7xl"
            >
              Our mission is to transform how work gets done
            </H1>
          </div>
          <div className="flex flex-row justify-center pt-4">
            <div className="max-w-4xl">
              <Hover3D depth={-20} perspective={1000} className="relative">
                <Div3D depth={-10} className="absolute top-0">
                  <img src="/static/landing/about/2.png" />
                </Div3D>
                <Div3D depth={40}>
                  <img src="/static/landing/about/1.png" />
                </Div3D>
                <Div3D depth={70} className="absolute top-0">
                  <img src="/static/landing/about/3.png" />
                </Div3D>
              </Hover3D>
            </div>
          </div>
        </div>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-8 xl:flex-row xl:items-start",
              "col-span-12 col-start-1 md:col-span-10 md:col-start-2"
            )}
          >
            <div className="flex w-full flex-row xl:max-w-lg">
              <H2>We're crafting the AI operating system for enterprises</H2>
            </div>
            <div className="flex w-full flex-col gap-2 xl:max-w-xl">
              <P>
                We're building Dust to serve as the operating system for
                AI-driven companies.
              </P>
              <P>
                Like Windows provided universal UI primitives that made
                applications more productive, we provide universal AI primitives
                that make enterprise workflows more intelligent.
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
          <Separator className="col-span-10 col-start-2" />
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col items-start gap-6",
              "col-span-12 col-start-1 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>Our operating principles</H2>
            <div className="flex w-full flex-col gap-2">
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
                seriously.
              </P>
            </div>
            <div className="flex flex-col">
              <P>
                These principles guide our decisions and actions. If they
                resonate with you, we'd love to hear from you.
              </P>
            </div>

            <div className="pt-4">
              <Link href="/jobs" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="We're hiring"
                  icon={ArrowRightIcon}
                />
              </Link>
            </div>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col items-start gap-6",
              "col-span-12 col-start-1 md:col-span-10 md:col-start-2"
            )}
          >
            <VideoPlayer />
          </div>
        </Grid>

        <Grid>
          <div className="col-span-12 col-start-1 md:col-span-10 md:col-start-2">
            <div className="grid grid-cols-2 justify-items-center gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Object.keys(PEOPLE).map((handle) => (
                <div key={handle} className="w-full">
                  <Person handle={handle} />
                </div>
              ))}
            </div>
          </div>
        </Grid>

        <Grid>
          <Separator className="col-span-12 col-start-1 md:col-span-10 md:col-start-2" />
        </Grid>

        <div className="flex flex-col gap-8">
          <Grid>
            <div
              className={classNames(
                "flex flex-col items-start gap-6",
                "col-span-12 col-start-1 md:col-span-10 md:col-start-2"
              )}
            >
              <H2>Built for enterprise, backed by experts</H2>
              <div className="flex w-full flex-col gap-2">
                <P>
                  We're backed by investors who've built and scaled enterprise
                  infrastructure. Our investors include leading venture firms
                  and founders who understand what it takes to transform how
                  companies operate.
                </P>
              </div>
            </div>
          </Grid>

          <Grid>
            <div className="col-span-12 col-start-1 grid grid-cols-10 gap-x-2 gap-y-8 md:col-span-10 md:col-start-2">
              {INVESTORS.map((investor) => (
                <div
                  key={investor.name}
                  className={classNames(
                    "col-span-5 md:col-span-3 xl:col-span-2"
                  )}
                >
                  <Investor name={investor.name} title={investor.title} />
                </div>
              ))}
            </div>
          </Grid>
        </div>
      </div>
    </>
  );
}

About.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
