import Head from "next/head";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { ComputerDesktopIcon } from "@heroicons/react/20/solid";
import { ArrowRightCircleIcon } from "@heroicons/react/24/outline";
import { ActionButton, Button } from "@app/components/Button";
import { Logo } from "@app/components/Logo";
import { CheckIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { classNames, communityApps } from "@app/lib/utils";
import { auth_user } from "@app/lib/auth";

const { GA_TRACKING_ID = null } = process.env;

const features = [
  {
    name: "Chained LLM apps",
    built: true,
    description:
      "Chain arbitrarily between calls to models, code execution and queries to external services.",
  },
  {
    name: "Multiple inputs",
    built: true,
    description:
      "Avoid overfitting by iterating on your LLM app design on several inputs simultaneously.",
  },
  {
    name: "Model choice",
    built: true,
    description:
      "Design against models served by OpenAI, Cohere, AI21 and more. Switch models seamlessly.",
  },
  {
    name: "Version history",
    built: true,
    description:
      "Have easy access to iterations, model outputs and few-shot examples saved automatically.",
  },
  {
    name: "Caching",
    built: true,
    description:
      "Speed up iterations and reduce costs with cached model interactions.",
  },
  {
    name: "Easy deployment & use",
    built: true,
    description: "Deploy to an API endpoint or use directly from Dust.",
  },
  {
    name: "DataSources",
    built: true,
    description:
      "Fully managed semantic search engines you can query from your workflows.",
  },
  {
    name: "Connections",
    built: false,
    description:
      "Connect your team's Notion, Google Docs or Slack to managed DataSources that are kept up-to-date automatically.",
  },
];

function Features() {
  return (
    <div className="mx-auto max-w-3xl xl:max-w-7xl">
      <div className="mx-auto text-center">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Build powerful workflows <br />
          on top of LLMs and Semantic Search🔥
        </h2>
      </div>
      <div className="py-16 px-4 sm:px-6 xl:py-24 xl:px-8">
        <dl className="space-y-10 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-12 sm:space-y-0 xl:grid-cols-4 xl:gap-x-8">
          {features.map((feature) => (
            <div key={feature.name} className="relative">
              <dt>
                <CheckIcon
                  className="absolute h-6 w-6 text-green-500"
                  aria-hidden="true"
                />
                <p className="ml-9 flex flex-row items-center text-lg font-medium leading-6 text-gray-900">
                  <span>{feature.name}</span>
                  {feature.built ? null : (
                    <span className="ml-2 rounded-md bg-gray-400 px-2 py-0.5 text-xs font-normal text-white">
                      coming soon
                    </span>
                  )}
                </p>
              </dt>
              <dd className="mt-2 ml-9 text-base text-gray-500">
                {feature.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export default function Home({ ga_tracking_id }) {
  return (
    <>
      <Head>
        <title>Dust - Design and Deploy Large Language Models Apps</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>

      <main className="mx-4">
        <div className="mx-8">
          <Logo />
        </div>

        <div className="mx-auto mt-12 sm:max-w-3xl lg:max-w-4xl">
          <h1 className="text-center text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            <div className="">Make and Deploy</div>
            <div className="leading-snug text-violet-600">
              Large Language Model Apps
            </div>
          </h1>

          <div className="mt-16 flex flex-col sm:flex-row">
            <div className="flex flex-1"></div>
            <div className="flex w-full flex-initial sm:mr-4 sm:w-auto">
              <Link href="https://docs.dust.tt" className="mx-auto">
                <Button className="mr-2">
                  <ArrowRightCircleIcon className="-ml-1 mr-2 h-4 w-4" />
                  View Documentation
                </Button>
              </Link>
            </div>
            <div className="flex w-full flex-initial sm:w-auto">
              <div className="mx-auto mt-2 sm:mt-0">
                <ActionButton
                  onClick={() =>
                    signIn("github", { callbackUrl: "/api/login" })
                  }
                >
                  <ComputerDesktopIcon className="-ml-1 mr-2 mt-0.5 h-5 w-5" />
                  Sign in with Github
                </ActionButton>
              </div>
            </div>
            <div className="flex flex-1"></div>
          </div>
        </div>

        <div className="mt-16">
          <Features />
        </div>

        <div className="mx-auto mt-8 space-y-4 divide-y divide-gray-200 px-6 sm:max-w-2xl lg:max-w-4xl">
          <div className="sm:flex sm:items-center">
            <div className="mt-8 sm:flex-auto">
              <h1 className="text-base font-medium text-gray-900">
                Community Example Apps
              </h1>

              <p className="text-sm text-gray-500">
                Discover apps created by the community. They serve as great
                examples to get started with Dust.
              </p>
            </div>
          </div>

          <div className="mt-8 overflow-hidden">
            <ul role="list" className="mb-8">
              {communityApps.map((app) => (
                <li key={app.sId} className="px-2">
                  <div className="py-4">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/${app.user}/a/${app.sId}`}
                        className="block"
                      >
                        <p className="truncate text-base font-bold text-violet-600">
                          {app.name}
                        </p>
                      </Link>
                      <div className="ml-2 flex flex-shrink-0">
                        <p
                          className={classNames(
                            "inline-flex rounded-full px-2 text-xs font-semibold leading-5",
                            app.visibility == "public"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          )}
                        >
                          {app.visibility}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-700">
                          {app.description}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-300 sm:mt-0">
                        <p>{app.sId}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="my-10 mx-auto max-w-3xl text-center text-gray-400">
          Dust is{" "}
          <a
            className="text-gray-700"
            href="https://github.com/dust-tt/dust"
            target="_blank"
          >
            open source
          </a>{" "}
          and part of{" "}
          <a
            className="text-gray-700"
            href="https://aigrant.org"
            target="_blank"
          >
            AI Grant
          </a>
        </div>
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga_tracking_id}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
             window.dataLayer = window.dataLayer || [];
             function gtag(){window.dataLayer.push(arguments);}
             gtag('js', new Date());

             gtag('config', '${ga_tracking_id}');
            `}
          </Script>
        </>
      </main>
    </>
  );
}

export async function getServerSideProps(context) {
  let authRes = await auth_user(context.req, context.res);
  if (authRes.isErr()) {
    return {
      props: { ga_tracking_id: GA_TRACKING_ID },
    };
  }
  let auth = authRes.value;

  if (!auth.isAnonymous()) {
    return {
      redirect: {
        destination: `/${auth.user().username}/apps`,
        permanent: false,
      },
    };
  }

  return {
    props: { ga_tracking_id: GA_TRACKING_ID },
  };
}
