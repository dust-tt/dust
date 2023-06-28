import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn } from "next-auth/react";
import p5Types from "p5";

import { ActionButton, Button } from "@app/components/Button";
import { Logo } from "@app/components/Logo";
import { getSession, getUserFromSession } from "@app/lib/auth";

// Will only import `react-p5` on client-side
const Sketch = dynamic(() => import("react-p5").then((mod) => mod.default), {
  ssr: false,
});

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    // TODO(spolu): persist latest workspace in session?
    let url = `/w/${user.workspaces[0].sId}`;
    if (context.query.wId) {
      url = `/api/login?wId=${context.query.wId}`;
    }
    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }
    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: GA_TRACKING_ID },
  };
};

const particuleNum = 60;

class Particle {
  pos: p5Types.Vector;
  vel: p5Types.Vector;
  acc: p5Types.Vector;
  angle: number;
  radius: number;

  constructor(p5: p5Types) {
    this.pos = p5.createVector(
      p5.random(p5.windowWidth * 2) - p5.windowWidth / 2,
      p5.random(p5.windowHeight)
    );
    this.vel = p5.createVector(p5.random(-1, 1), p5.random(-1, 1));
    this.acc = p5.createVector();
    this.angle = p5.random(p5.TWO_PI);
    this.radius = p5.random(30, 120);
  }

  applyForce(force: p5Types.Vector) {
    this.acc.add(force);
  }

  update(p5: p5Types) {
    let percent = p5.millis() / 10000;
    if (percent > 1) {
      percent = 1;
    }
    const center = p5.createVector(
      p5.windowWidth / 2,
      (1 * p5.windowHeight) / 3
    );
    const circlingForce = p5.createVector(
      p5.cos(this.angle),
      p5.sin(this.angle)
    );
    circlingForce.mult(this.radius * percent);
    center.add(circlingForce);
    const attractionForce = center.sub(this.pos);
    attractionForce.normalize();
    attractionForce.mult(0.005 * percent);
    this.applyForce(attractionForce);
    this.angle += 0.01;
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.vel.limit(3);
  }
}

function Cloud() {
  const particles: Particle[] = [];

  const setup = (p5: p5Types, canvasParentRef: Element) => {
    p5.createCanvas(p5.windowWidth, p5.windowHeight).parent(canvasParentRef);
    p5.frameRate(30);
    for (let i = 0; i < particuleNum; i++) {
      particles.push(new Particle(p5));
    }
  };

  const draw = (p5: p5Types) => {
    p5.clear();
    let p: Particle | null = particles[particles.length - 1];

    // First, update all particles and draw all lines
    for (const particle of particles) {
      particle.update(p5);

      if (p) {
        p5.strokeWeight(1.0);
        p5.stroke("#F0FDF4");
        p5.line(particle.pos.x, particle.pos.y, p.pos.x, p.pos.y);
      }

      p = particle;
    }

    // Then, draw all ellipses
    for (const particle of particles) {
      p5.noStroke();
      p5.fill("#A7F3D0");
      p5.ellipse(particle.pos.x, particle.pos.y, 5, 5);
    }
  };

  return <Sketch setup={setup} draw={draw} />;
}

export default function Home({
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Dust - Build Smarter Teams with AI</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
        <meta
          id="meta-description"
          name="description"
          content="Harnesses the power of LLMs to help your teams craft better content, understand their environment faster, and ultimately take better decisions."
        />
        <meta
          id="og-title"
          property="og:title"
          content="Dust - Build Smarter Teams with Generative AI"
        />
        <meta
          id="og-image"
          property="og:image"
          content="/static/og_image.png"
        />
      </Head>

      <div className="absolute bottom-0 left-0 right-0 top-0 -z-50 overflow-hidden">
        <Cloud />
      </div>

      <main className="z-10 mx-4">
        <div className="relative isolate -mx-4 -mb-2 flex items-center gap-x-6 overflow-hidden bg-gray-50 px-6 py-2.5 sm:px-3.5 sm:before:flex-1">
          <div
            className="absolute left-[max(-7rem,calc(50%-52rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            aria-hidden="true"
          >
            <div
              className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              style={{
                clipPath:
                  "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
              }}
            ></div>
          </div>
          <div
            className="absolute left-[max(45rem,calc(50%+8rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            aria-hidden="true"
          >
            <div
              className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              style={{
                clipPath:
                  "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
              }}
            ></div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-center text-sm leading-6 text-gray-900">
              <strong className="font-semibold">
                🥳 Announcing our seed round
              </strong>{" "}
              led by Sequoia&nbsp;Capital
              <a
                href="https://blog.dust.tt/2023-06-27-announcing-seed"
                className="ml-2 inline-block flex-none rounded-full bg-gray-900 px-3.5 py-1 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                target="_blank"
              >
                Read more
              </a>
            </p>
          </div>
          <div className="flex flex-1 justify-end"></div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          <div className="col-span-2 text-left">
            <Logo />
          </div>
          <div className="col-span-3 mr-2 mt-8 text-right">
            <ActionButton
              onClick={() =>
                signIn("google", {
                  callbackUrl: router.query.wId
                    ? `/api/login?wId=${router.query.wId}`
                    : `/api/login`,
                })
              }
            >
              <img
                src="/static/google_white_32x32.png"
                className="ml-1 h-4 w-4"
              />
              <span className="ml-2 mr-1">Sign in with Google</span>
            </ActionButton>

            {!(router.query.signIn && router.query.signIn !== "github") && (
              <div className="ml-32 mt-1 text-xs text-gray-500">
                or{" "}
                <span
                  className="cursor-pointer hover:font-bold"
                  onClick={() => {
                    void signIn("github", {
                      callbackUrl: router.query.wId
                        ? `/api/login?wId=${router.query.wId}`
                        : `/api/login`,
                    });
                  }}
                >
                  GitHub
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div className="grid grid-cols-1">
            <p className="mt-32 text-6xl font-bold tracking-tighter text-gray-800 sm:mt-16">
              <span className="bg-gradient-to-r from-violet-700 to-purple-500 bg-clip-text text-transparent sm:text-6xl md:text-8xl">
                Smarter Teams
              </span>{" "}
              <br />
              with safe generative&nbsp;AI
              <br />
            </p>
          </div>

          <div className="h-10"></div>

          <div className="grid grid-cols-1 gap-4 text-2xl text-gray-700 md:grid-cols-2 lg:grid-cols-3">
            <p className="rounded font-light lg:col-span-2">
              AI is changing the way we work.
              <br />
              Harnessing its potential swiftly and effectively is
              a&nbsp;key&nbsp;competitive advantage for&nbsp;any&nbsp;company.
            </p>
            <p className="rounded font-light lg:col-span-2 lg:pr-8">
              With Dust, get all the might of large language models
              in&nbsp;a&nbsp;user-friendly&nbsp;package, while&nbsp;ensuring
              the&nbsp;safety of your&nbsp;company's&nbsp;data.
            </p>
          </div>

          <div className="h-20"></div>

          <div className="grid grid-cols-1">
            <p className="text-4xl font-bold">
              <span className="bg-gradient-to-r from-violet-700 to-purple-500 bg-clip-text text-transparent">
                Our product constitution
              </span>
            </p>
          </div>

          <div className="h-6"></div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-medium">
                Augmenting humans, not&nbsp;replacing&nbsp;them
              </p>
              <div className="h-2"></div>
              <p className="font-light">
                We're optimistic about making work life better for smart people.
                We're building R2-D2, not Skynet.
              </p>
            </div>
            <div>
              <p className="font-medium">
                Uncompromising on data security & privacy
              </p>
              <div className="h-2"></div>
              <p className="font-light">
                We aspire to define standards rather than simply abide by
                the&nbsp;existing ones.
              </p>
            </div>
            <div>
              <p className="font-medium">Hard problems over hype</p>
              <div className="h-2"></div>
              <p className="font-light">
                There's more to do than wrapping GPT into a chat UI. We're in
                this to solve hard problems on user experience and product
                quality.
              </p>
            </div>
            <div>
              <p className="font-medium">Building with an&nbsp;AI&nbsp;core</p>
              <div className="h-2"></div>
              <p className="font-light">
                We're building with large language models in mind from the
                ground up, rather than sprinkling them here and&nbsp;there.
              </p>
            </div>
          </div>

          <div className="h-20"></div>

          <div className="grid grid-cols-1">
            <p className="text-4xl font-bold">
              <span className="bg-gradient-to-r from-violet-700 to-purple-500 bg-clip-text text-transparent">
                The secret sauce
              </span>
            </p>

            <div className="h-6"></div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <p className="text-2xl font-bold tracking-tighter text-gray-700 lg:col-span-2">
                The experience{" "}
                <span className="bg-green-400 text-white">
                  to build the right product
                </span>
              </p>
              <p className="rounded font-light lg:col-span-2">
                Great things happen when technical skills, operational
                excellence and passion for&nbsp;simple, empathetic user
                experience come&nbsp;together.
              </p>
              <p className="rounded font-light lg:col-span-2">
                Our team combines engineering, product and design experiences
                from leading companies like{" "}
                <b>
                  <i>Alan</i>
                </b>
                ,{" "}
                <b>
                  <i>Artefact</i>
                </b>
                ,{" "}
                <b>
                  <i>Aurora Innovation</i>
                </b>
                ,{" "}
                <b>
                  <i>BlaBlaCar</i>
                </b>
                ,{" "}
                <b>
                  <i>OpenAI</i>
                </b>
                ,{" "}
                <b>
                  <i>Stripe</i>
                </b>{" "}
                and&nbsp;
                <b>
                  <i>Withings</i>
                </b>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div className="mt-32">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Internal data{" "}
                    <span className="bg-green-400 text-white">
                      vectorized, not rasterized
                    </span>
                  </div>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Bring your internal data in context with fully managed
                    semantic search engines to expose it to large language
                    models apps.
                  </p>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Safely connect Notion, Slack, etc… as continuously updated
                    embeddings.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto overflow-hidden rounded-lg border border-violet-200 bg-white px-2 py-4">
                  <img
                    className="mx-auto w-[400px]"
                    src="/static/landing_data_sources.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Smart{" "}
                    <span className="bg-green-400 text-white">
                      read and write tools
                    </span>
                  </div>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Disentangle how information is created and stored from where
                    and how it's consumed by your team.
                  </p>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Find tailored answers to your questions rather than a list
                    of documents. Stay updated on projects in just as many
                    bullet points as you have time for. Make your notes and
                    memos crisp, compelling, and consistent with the team
                    lexicon and tone of voice.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto overflow-hidden rounded-lg border border-violet-200 bg-white px-2 py-2">
                  <img
                    className="mx-auto w-[400px]"
                    src="/static/landing_chat.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Your own{" "}
                    <span className="bg-green-400 text-white">
                      powerful workflows
                    </span>
                  </div>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Build custom Large Language Model apps with the models of
                    your choice and your own data sources. Tweak, evaluate and
                    maintain them in a visual interface that assists you with
                    the intricacies of prompting and chaining stochastic models.
                  </p>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Deploy your own apps internally either with a GUI or via
                    API.
                  </p>
                  <div className="mt-6">
                    <Link href="https://docs.dust.tt">
                      <Button>
                        <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                        View Documentation
                      </Button>
                    </Link>
                  </div>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto overflow-hidden rounded-lg border border-violet-200 bg-white px-2 py-2">
                  <img
                    className="mx-auto w-[400px]"
                    src="/static/landing_block.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="h-32"></div>
        </div>

        <div className="mx-auto my-10 mt-32 max-w-3xl pb-8 text-center text-sm text-gray-400">
          Dust © 2022-2023 –{" "}
          <Link href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1">
            Legal
          </Link>
          {" - "}
          <Link href="https://dust-tt.notion.site/Privacy-1a329ca7b8e349e88b5ec3277fe35189">
            Privacy
          </Link>
          {" - "}
          <Link href="https://dust-tt.notion.site/Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb">
            Terms
          </Link>
          {" - "}
          <Link href="https://dust-tt.notion.site/Cookie-Policy-ec63a7fb72104a7babff1bf413e2c1ec">
            Cookies
          </Link>
        </div>
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
             window.dataLayer = window.dataLayer || [];
             function gtag(){window.dataLayer.push(arguments);}
             gtag('js', new Date());

             gtag('config', '${gaTrackingId}');
            `}
          </Script>
          <Script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js" />
        </>
      </main>
    </>
  );
}
