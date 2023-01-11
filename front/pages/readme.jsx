import Head from "next/head";
import Script from "next/script";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { Logo } from "../components/Logo";

const { GA_TRACKING_ID = null } = process.env;

function Block({ type }) {
  return (
    <span className="rounded-md px-1 py-0.5 bg-gray-200 font-bold text-sm">
      {type}
    </span>
  );
}

export default function Readme({ ga_tracking_id }) {
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

        <div className="mx-2 sm:mx-12 mt-10 text-gray-800 text-justify">
          <p className="font-bold my-8 text-xl">
            <span className="text-gray-200">#</span> Dust README
          </p>
          <p className="mb-4">
            Welcome to Dust! This README formally covers the basic concepts of
            Dust apps. The easiest way to get started is to explore{" "}
            <a
              href="https://dust.tt/spolu/a/2316f9c6b0"
              className="font-bold text-violet-600 underline"
              target="_blank"
            >
              a
            </a>{" "}
            <a
              href="https://dust.tt/spolu/a/d12ac33169"
              className="font-bold text-violet-600 underline"
              target="_blank"
            >
              working
            </a>{" "}
            <a
              href="https://dust.tt/bcmejla/a/cc20d98f70"
              className="font-bold text-violet-600 underline"
              target="_blank"
            >
              example
            </a>
            . You can then use this document as reference as you build your
            first app.
          </p>
          <p className="mb-4">
            Dust apps are composed of blocks which are executed sequentially on
            each input data-point. Blocks have a <b>type</b> (described below)
            and a <b>BLOCK_NAME</b>. Each block execution for a given input
            data-point outputs a JSON object that can be accessed by later
            blocks when executed on the same input data-point.
          </p>

          <p className="font-bold mt-6 mb-4">
            <span className="text-gray-200">##</span> Core block types
          </p>
          <ul>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-4">
                  <Block type="input" />
                </div>
                <p>
                  This block pulls data-points from a dataset and forks the
                  execution stream on each element of the dataset so that
                  subsequent blocks are executed with a different context for
                  each input data-point. There can be at most one{" "}
                  <Block type="input" /> block per Dust app.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-5">
                  <Block type="data" />
                </div>
                <p>
                  This block pulls data-points from a dataset and returns them
                  as an array. If executed after the <Block type="input" />{" "}
                  block, for each execution stream the block will output an
                  array with the entire dataset. It is generally used in
                  conjunction with an <Block type="llm" /> block to manage
                  few-shot examples.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-4 ml-5">
                  <Block type="code" />
                </div>
                <p>
                  This block executes the code provided by the user. It must
                  implement a function called
                  <span className="font-mono">`_fun`</span>
                  which takes as input a variable
                  <span className="font-mono">`env`</span>. Previous block
                  outputs for the current data-point can be accessed by
                  <span className="font-mono">`env.state.BLOCK_NAME`</span>. It
                  is generally used to post-process outputs from{" "}
                  <Block type="llm" /> blocks.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-6">
                  <Block type="llm" />
                </div>
                <p>
                  This block provides a standard interface to large language
                  models. The
                  <span className="font-mono">`prompt`</span>
                  field is used to prompt the model. It can refer to previous
                  block outputs by using
                  <span className="font-mono">
                    `{"{{"}BLOCK_NAME.field{"}}"}`
                  </span>
                  . It supports advanced templating using the{" "}
                  <a
                    href="https://tera.netlify.app/"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    Tera template engine
                  </a>{" "}
                  (similar to Jinja2/Django). Templating lets you easily define
                  few-shot examples from blocks that output an array (such as a{" "}
                  <Block type="data" /> block). See this{" "}
                  <a
                    href="https://dust.tt/spolu/a/d12ac33169"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    app
                  </a>{" "}
                  for an example usage of templating.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-3">
                  <Block type="map" />
                  <br />
                  <Block type="reduce" />
                </div>
                <p>
                  This advanced pair block is used to subsequently fork the
                  execution stream. The <Block type="map" /> takes as input a{" "}
                  <b>BLOCK_NAME</b>. If <b>BLOCK_NAME</b> output is an array it
                  will map on each element of the array. If the output is an
                  object you can use the
                  <span className="font-mono">`repeat`</span> field to repeat
                  the same output object multiple time.
                </p>
              </span>
            </li>
          </ul>

          <p className="font-bold mt-6 mb-4">
            <span className="text-gray-200">##</span> Integration block types
          </p>
          <ul>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-8">
                  <Block type="curl" />
                </div>
                <p>
                  This block lets you perform a curl request to an external
                  service. You can use it to call into a{" "}
                  <a
                    href="https://replit.com/"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    Replit
                  </a>{" "}
                  endpoint as an example to perform advanced computations.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-6">
                  <Block type="search" />
                </div>
                <p>
                  This block lets you query Google to retrieve search results.
                  It is based on{" "}
                  <a
                    href="https://serpapi.com/"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    SerpAPI
                  </a>
                  . You can set it up in your account's provider section.
                </p>
              </span>
            </li>
            <li className="my-4">
              <span className="flex flex-row items-center">
                <div className="mx-4 ml-5">
                  <Block type="browser" />
                </div>
                <p>
                  This block lets you scrape the content of a web page. It is
                  based on{" "}
                  <a
                    href="https://browserless.io/"
                    className="font-bold text-violet-600 underline"
                    target="_blank"
                  >
                    Browserless.io
                  </a>
                  . You can set it up in your account's provider section.
                </p>
              </span>
            </li>
          </ul>

          <p className="font-bold mt-6 mb-4">
            <span className="text-gray-200">##</span> Datasets
          </p>
          <p className="mb-4">
            Datasets are managed separately from your app logic and refered to
            by blocks (<Block type="input" /> and <Block type="data" />
            ). You can create a dataset and later iterate on it to add new input
            data-points or few-shot examples. When an app is run, the version of
            the dataset used is stored and can be later retrieved.
          </p>

          <p className="font-bold mt-6 mb-4">
            <span className="text-gray-200">##</span> Getting started
          </p>
          <p className="mb-4">
            The best way to get started before building your first app is to
            study and potentially directly clone the following example apps:
          </p>
          <ul>
            <li className="my-4 mx-2">
              <span className="font-mono">
                <a
                  href="https://dust.tt/spolu/a/d12ac33169"
                  className="font-bold text-violet-600 underline"
                  target="_blank"
                >
                  Generate code to answer math questions
                </a>{" "}
              </span>
            </li>
            <li className="my-4 mx-2">
              <span className="font-mono">
                <a
                  href="https://dust.tt/bcmejla/a/cc20d98f70"
                  className="font-bold text-violet-600 underline"
                  target="_blank"
                >
                  Automatic wedding thank you notes
                </a>{" "}
              </span>
            </li>
            <li className="my-4 mx-2">
              <span className="font-mono">
                <a
                  href="https://dust.tt/spolu/a/2316f9c6b0"
                  className="font-bold text-violet-600 underline"
                  target="_blank"
                >
                  Answer questions by searching the web
                </a>{" "}
              </span>
            </li>
          </ul>
          <p className="mb-4">
            We hope you enjoy Dust and the new experience to prompt engineering
            it provides. Don't hesitate to join our{" "}
            <a
              href="https://discord.gg/8NJR3zQU5X"
              className="font-bold text-violet-600 underline"
              target="_blank"
            >
              Discord server
            </a>{" "}
            to ask questions and get support.
          </p>
          <div className="mt-10"></div>
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

  return {
    props: { session, ga_tracking_id: GA_TRACKING_ID },
  };
}
