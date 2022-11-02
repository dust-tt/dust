import Head from "next/head";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { ComputerDesktopIcon } from "@heroicons/react/20/solid";
import { ActionButton, Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { CheckIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { classNames, communityApps } from "../lib/utils";

const { GA_TRACKING_ID = null } = process.env;

const features = [
  {
    name: "Chained LLM apps",
    built: true,
    description:
      "Chain arbitrarily between calls to models and code execution.",
  },
  {
    name: "Multiple inputs",
    built: true,
    description:
      "Avoid overfitting by iterating on your LLM app design on several inputs simultaneously.",
  },
  {
    name: "Switch models",
    built: true,
    description:
      "Design against models served by Cohere, OpenAI, and more soon. Switch models seamlessly.",
  },
  {
    name: "Few-shot examples sanity",
    built: true,
    description: "Manage few-shot examples in isolated and versioned datasets.",
  },
  {
    name: "History preserved",
    built: true,
    description:
      "Iterations, model ouptputs and few-shot examples are saved and versioned automatically.",
  },
  {
    name: "Caching",
    built: true,
    description:
      "Speed up iterations and reduce costs with cached model interactions.",
  },
  {
    name: "Models that act",
    built: true,
    description:
      "Build apps that take action: search Google, curl block and more integrations to come.",
  },
  {
    name: "Easy deployment",
    built: false,
    description:
      "Deploy in one click. Aggregate production traffic for later testing and fine-tuning.",
  },
];

function Features() {
  return (
    <div className="mx-auto max-w-3xl xl:max-w-7xl">
      <div className="mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Prompt engineering, re-imagined🔥
        </h2>
        <p className="mt-4 px-4 text-normal sm:text-lg text-gray-500">
          Built on years of experience working with large language models.
          <br />
          With one goal, help accelerate their deployment.
        </p>
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
                <p className="flex flex-row ml-9 text-lg font-medium leading-6 text-gray-900 items-center">
                  <span>{feature.name}</span>
                  {feature.built ? null : (
                    <span className="text-xs font-normal bg-gray-400 text-white rounded-md px-2 py-0.5 ml-2">
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

        <div className="mx-auto sm:max-w-3xl lg:max-w-4xl mt-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-center text-gray-900">
            <span className="">Design and Deploy</span> <br />
            <span className="text-violet-600">
              Large Language Model Apps
            </span>{" "}
            {/*
            <span className="">Advanced Playground for</span> <br />
            <span className="text-violet-600">
              Large Language Models Apps
            </span>{" "}
            <br />
            <span className="">Design</span>
           */}
          </h1>

          <div className="mx-auto w-48 mt-16">
            <ActionButton
              onClick={() => signIn("github", { callbackUrl: "/api/login" })}
            >
              <ComputerDesktopIcon className="-ml-1 mr-2 h-5 w-5 mt-0.5" />
              Sign in with Github
            </ActionButton>
          </div>
        </div>

        <div className="mt-24">
          <Features />
        </div>

        <div className="mx-auto sm:max-w-2xl lg:max-w-4xl px-6 divide-y divide-gray-200 space-y-4">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto mt-8">
              <h1 className="text-base font-medium text-gray-900">
                Community Example Apps
              </h1>

              <p className="text-sm text-gray-500">
                Discover apps created by the community. They serve as great
                examples to get started with Dust.
              </p>
            </div>
          </div>

          <div className="overflow-hidden mt-8">
            <ul role="list" className="mb-8">
              {communityApps.map((app) => (
                <li key={app.sId} className="px-2">
                  <div className="py-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/${app.user}/a/${app.sId}`}>
                        <a className="block">
                          <p className="truncate text-base font-bold text-violet-600">
                            {app.name}
                          </p>
                        </a>
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
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  if (session) {
    return {
      redirect: {
        destination: `/${session.user.username}/apps`,
        permanent: false,
      },
    };
  }

  return {
    props: { session, ga_tracking_id: GA_TRACKING_ID },
  };
}
