import { Logo } from "@dust-tt/sparkle";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn } from "next-auth/react";
import p5Types from "p5";
import { ParsedUrlQuery } from "querystring";

import { GoogleSignInButton } from "@app/components/Button";
import { Button } from "@dust-tt/sparkle";
import { getUserMetadata } from "@app/lib/api/user";
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
    let url = `/w/${user.workspaces[0].sId}`;

    const m = await getUserMetadata(user, "sticky_path");
    if (m) {
      url = m.value;
    }

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

  function getCallbackUrl(routerQuery: ParsedUrlQuery): string {
    let callbackUrl = "/api/login";
    if (routerQuery.wId) {
      callbackUrl += `?wId=${routerQuery.wId}`;
    } else if (routerQuery.inviteToken) {
      callbackUrl += `?inviteToken=${routerQuery.inviteToken}`;
    }
    return callbackUrl;
  }

  return (
    <>
      <Head>
        <title>Dust - Smarter Teams with AI</title>
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
        <link
          rel="stylesheet"
          href="https://use.typekit.net/lzv1deb.css"
        ></link>
      </Head>

      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />

      {/* <div className="absolute bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden">
        <Cloud />
      </div> */}

      <main className="z-10 mx-4">
        <div className="grid grid-cols-5 gap-1">
          <div className="col-span-2 text-left font-objektiv">
            <Logo className="mx-4 h-24 w-auto" />
          </div>
          <div className="col-span-3 mr-2 mt-8 text-right font-objektiv">
            <GoogleSignInButton
              onClick={() =>
                signIn("google", {
                  callbackUrl: getCallbackUrl(router.query),
                })
              }
            >
              <img
                src="/static/google_white_32x32.png"
                className="ml-1 h-4 w-4"
              />
              <span className="ml-2 mr-1">Sign in with Google</span>
            </GoogleSignInButton>

            {!(router.query.signIn && router.query.signIn !== "github") && (
              <div className="ml-32 mt-1 font-objektiv text-xs text-slate-300">
                or{" "}
                <span
                  className="cursor-pointer hover:font-bold"
                  onClick={() => {
                    void signIn("github", {
                      callbackUrl: getCallbackUrl(router.query),
                    });
                  }}
                >
                  GitHub
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="h-44"></div>

        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div className="grid grid-cols-1">
            <p className="mt-16 font-objektiv text-6xl font-bold tracking-tighter text-slate-50">
              <span className="font-objektiv text-6xl text-red-400 sm:font-objektiv md:font-objektiv">
                Secure AI assistant
              </span>{" "}
              <br />
              with your company’s&nbsp;knowledge
              <br />
            </p>
          </div>

          <div className="h-10"></div>

          <div className="grid grid-cols-1 gap-4 font-objektiv text-xl text-slate-300 md:grid-cols-2 lg:grid-cols-3">
            <p className="font-regular lg:col-span-2">
              AI is changing the way we work and is a competitive advantage
              for&nbsp;smart teams that harness its&nbsp;potential effectively.
            </p>
            <p className="font-regular lg:col-span-2">
              Dust is an AI assistant that safely brings the best large language
              models, continuously updated company knowledge, powerful
              collaboration applications, and an&nbsp;extensible platform
              to&nbsp;your team’s&nbsp;fingertips.
            </p>
          </div>
        </div>

        <div className="mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div className="mt-32">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="flex flex-col justify-center self-center text-left md:col-span-4 md:pr-8">
                <div className="mt-2">
                  <div className="font-objektiv text-2xl font-bold tracking-tighter text-red-400">
                    GPT-4 and all your internal knowledge, <br />
                    <span className="text-5xl text-rose-200">combined</span>.
                  </div>
                  <p className="font-regular mt-4 font-objektiv text-lg text-slate-300">
                    Use Dust for unified and safe access to GPT-4.
                  </p>
                  <p className="font-regular mt-4 font-objektiv text-lg text-slate-300">
                    Connect Dust to your team’s data and break down knowledge
                    silos with always up-to-date answers
                    in&nbsp;a&nbsp;chat&nbsp;UI.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto overflow-hidden ">
                  <img
                    className="mx-auto w-[500px] rotate-2"
                    src="/static/landing_data_sources.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto">
                  <img
                    className="mx-auto w-[500px] -rotate-2"
                    src="/static/landing_chat.png"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center self-center text-left md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="font-objektiv text-2xl font-bold tracking-tighter text-emerald-500">
                    Get your teams <br />
                    <span className="text-5xl text-green-300">
                      up to speed
                    </span>{" "}
                    on AI.
                  </div>
                  <p className="font-regular mt-4 font-objektiv text-lg text-slate-300">
                    Let your team share prompts and conversations to ramp up on
                    the potential of generative AI for their tasks.
                  </p>
                  <p className="font-regular mt-4 font-objektiv text-lg text-slate-300">
                    Get suggestions from Dust on documentation updates and
                    improvements based on ongoing internal conversations and
                    decisions.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="flex flex-col justify-center self-center text-left md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="font-objektiv text-2xl font-bold tracking-tighter text-blue-500">
                    Build your own <br />
                    <span className="text-5xl text-sky-300">
                      powerful workflows
                    </span>
                    .
                  </div>
                  <p className="font-regular mt-4 font-objektiv text-lg text-slate-300">
                    Build custom Large Language Model apps on top of your
                    company data. Let Dust assist you with the details of
                    working with LLMs as you adapt them to your specific needs.
                  </p>
                  <div className="mt-6">
                    <Link href="https://docs.dust.tt">
                      <Button
                        type="tertiary"
                        size="sm"
                        label="View Documentation"
                      />
                    </Link>
                  </div>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto">
                  <img
                    className="mx-auto w-[500px] rotate-2"
                    src="/static/landing_block.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="h-32"></div>

          <div className="grid grid-cols-1">
            <p className="font-objektiv text-3xl font-bold text-red-400">
              Our product
              <br />
              <span className="text-5xl text-rose-300">constitution</span>
            </p>
          </div>

          <div className="h-6"></div>

          <div className="grid gap-4 text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-semibold text-slate-100">
                Augmenting humans, not&nbsp;replacing&nbsp;them
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We're optimistic about making work life better for smart people.
                We're building R2-D2, not Skynet.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Uncompromising on data security & privacy
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We aspire to define standards rather than simply abide by
                the&nbsp;existing ones.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Hard problems over hype
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                There's more to do than wrapping GPT into a chat UI. We're in
                this to solve hard problems on user experience and product
                quality.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Building with an&nbsp;AI&nbsp;core
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We're building with large language models in mind from the
                ground up, rather than sprinkling them here and&nbsp;there.
              </p>
            </div>
          </div>

          <div className="h-32"></div>
        </div>

        <div className="mx-auto my-10 mt-32 max-w-3xl pb-8 text-center font-objektiv font-objektiv text-sm text-gray-400">
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
