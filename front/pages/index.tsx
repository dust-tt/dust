import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn } from "next-auth/react";
import p5Types from "p5";

import { ActionButton } from "@app/components/Button";
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
    let url = `/w/${user.workspaces[0].sId}/a`;
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

  show(p5: p5Types, nextPos: p5Types.Vector | null = null) {
    p5.fill(0, 0, 0);
    // p5.noStroke();
    // p5.circle(this.pos.x, this.pos.y, 2);
    // if nextPos draw a line ot the next one
    if (nextPos) {
      p5.line(this.pos.x, this.pos.y, nextPos.x, nextPos.y);
    }
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
    for (const particle of particles) {
      particle.update(p5);
      particle.show(p5, p?.pos);
      p = particle;
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
        <title>Dust - Unleash your Company Data with Generative AI</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>

      <div className="absolute bottom-0 left-0 right-0 top-0 -z-50 opacity-5">
        <Cloud />
      </div>
      <main className="z-10 mx-4">
        <div className="mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div className="-ml-4 -mt-2">
            <Logo />
          </div>

          <p className="mt-12 text-5xl font-bold tracking-tighter text-gray-800 sm:mt-16 sm:text-7xl lg:text-8xl">
            Build
            <br />
            <span className="bg-gradient-to-r from-violet-700 to-purple-500 bg-clip-text text-transparent">
              Smarter Teams
            </span>{" "}
            <br />
            with Generative AI
            <br />
          </p>

          <div className="mt-12 grid sm:grid-cols-6">
            <div className="text-lg text-gray-900 sm:col-span-4">
              <p className="rounded bg-white bg-opacity-50 font-light">
                Fast-growing companies all feel the pain of rapidly growing
                internal information debt. But LLMs have the potential to
                fundamentally change how data is created or consumed in the
                enterprise, and can be harnessed to help teams craft better
                content, understand their environment faster, and ultimately
                take better decisions.
              </p>

              <p className="mt-4 bg-white bg-opacity-50 text-lg font-medium">
                Get better work done faster with Dust, the{" "}
                <span className="bg-gradient-to-r from-violet-700 to-purple-500 bg-clip-text text-transparent">
                  Smart Team OS
                </span>{" "}
              </p>
              <div className="mt-12">
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
              </div>
            </div>
          </div>

          <div className="mt-32 ">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pl-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Internal data{" "}
                    <span className="bg-orange-500 text-white">
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
                <div className="mx-auto overflow-hidden rounded-lg border border-violet-200 bg-white px-2 py-2">
                  <img
                    className="mx-auto w-[393px]"
                    src="/static/landing_data_sources.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pl-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Smart{" "}
                    <span className="bg-orange-500 text-white">
                      read and write
                    </span>{" "}
                    tools
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
                    className="mx-auto w-[418px]"
                    src="/static/landing_chat.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <div className="md:grid md:grid-cols-8">
              <div className="flex flex-col md:col-span-4 md:pl-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="text-2xl font-bold tracking-tighter text-gray-700">
                    Your own{" "}
                    <span className="bg-orange-500 text-white">
                      powerful workflows
                    </span>
                  </div>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Build custom Large Language Model apps with the models of
                    your choice and your own data sources. Tweak, evaluate and
                    maintain them in a visual interface that assists you in the
                    process of prompting stochastic models.
                  </p>
                  <p className="mt-4 bg-white bg-opacity-50 text-lg font-light">
                    Deploy your own apps internally either with a GUI or via
                    API.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto overflow-hidden rounded-lg border border-violet-200 bg-white px-2 py-2">
                  <img
                    className="mx-auto w-[396px]"
                    src="/static/landing_block.png"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto my-10 mt-32 max-w-3xl pb-8 text-center text-sm text-gray-400">
          Dust © 2022 – 2023
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
