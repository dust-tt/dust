import { Disclosure, Menu } from "@headlessui/react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/20/solid";
import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useState } from "react";
import { useEffect } from "react";

import { ActionButton } from "@app/components/Button";
import { classNames } from "@app/lib/utils";
import { timeAgoFrom } from "@app/lib/utils";

const { URL } = process.env;

// load local file ./run.json into variable RUN
const RUN = require("./run.json");

function Result({ documentId, summary, facts, timestamp, score }) {
  let [issue, article] = documentId.split("-").slice(1);
  const [factExpanded, setFactExpanded] = useState(false);

  return (
    <div className="flex w-full flex-col pt-2">
      <div className="flex w-full flex-initial flex-row text-sm">
        <div className="flex flex-initial font-bold text-violet-600">
          <Link
            href={`http://www.phrack.org/issues/${issue}/${article}.html#article`}
            target="_blank"
          >
            {documentId}
          </Link>
          <span className="ml-2 font-normal text-gray-400">
            (score: {score.toFixed(2)})
          </span>
        </div>
        <div className="ml-2 flex-initial font-bold text-gray-600">
          {timeAgoFrom(timestamp)}
        </div>
      </div>
      <div className="mt-2 flex w-full max-w-2xl flex-initial flex-row text-sm text-gray-600">
        {summary}
      </div>
      <div className="mt-1 flex w-full max-w-3xl flex-initial flex-col text-sm text-gray-600">
        <div
          className="flex flex-initial cursor-pointer font-bold text-gray-700"
          onClick={() => {
            setFactExpanded(!factExpanded);
          }}
        >
          {factExpanded ? (
            <ChevronDownIcon
              className="mt-0.5 h-4 w-4 cursor-pointer text-gray-600"
              onClick={() => {
                setFactExpanded(false);
              }}
            />
          ) : (
            <ChevronRightIcon
              className="mt-0.5 h-4 w-4 cursor-pointer text-gray-600"
              onClick={() => {
                setFactExpanded(true);
              }}
            />
          )}
          <span className="text-sm font-normal italic text-gray-400">
            {facts.length} facts
          </span>
        </div>
        {factExpanded ? (
          <ul className="ml-4 list-disc space-y-0">
            {facts.map((fact, i) => (
              <li key={i} className="ml-4">
                <span
                  className={classNames(
                    "mt-2 flex w-full rounded-sm bg-blue-50 p-1 italic text-gray-600"
                  )}
                >
                  {fact}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function DemoQA({ run }) {
  let results = run.traces[3][1][0].map((x) =>
    JSON.parse(x.value.message.content)
  );
  let documents = run.traces[2][1][0].map((x) => x.value)[0];
  for (var i = 0; i < results.length; i++) {
    results[i].documentId = documents[i]["document_id"];
    results[i].timestamp = documents[i].timestamp;
    results[i].score = documents[i].chunks[0].score;
  }

  const [query, setQuery] = useState(run.traces[0][1][0][0].value.question);
  const [answer, setAnswer] = useState("short");
  const [sortedResults, setSortedResults] = useState(results);
  const [sort, setSort] = useState("score");

  let short = run.traces[6][1][0][0].value.message.content;
  let onePager = run.traces[7][1][0][0].value.message.content;

  useEffect(() => {
    let r = results.slice();
    if (sort === "score") {
      r.sort((a, b) => b.score - a.score);
    } else if (sort === "timestamp") {
      r.sort((a, b) => b.timestamp - a.timestamp);
    }
    setSortedResults(r);
  }, [sort]);

  return (
    <main data-color-mode="light">
      <Head>
        <title>{`Dust - QA`}</title>
        <link rel="shortcut icon" href="/static/favicon.png" />
      </Head>
      <Disclosure as="nav" className="bg-white">
        {({ open }) => (
          <>
            <div className="mx-auto px-4">
              <div className="relative flex h-12 items-center">
                <div className="flex flex-initial items-center justify-center sm:items-stretch sm:justify-start">
                  <div className="flex flex-shrink-0 items-center py-1 pl-2">
                    <div className="flex rotate-[30deg]">
                      <div className="h-2 w-[4px] rounded-md bg-gray-400"></div>
                      <div className="h-2 w-[1px] bg-white"></div>
                      <div className="h-3 w-[4px] rounded-md bg-gray-400"></div>
                    </div>
                    <div className="h-2 w-[4px] bg-white"></div>
                    <div className="select-none text-base font-bold tracking-tight text-gray-800">
                      <Link href={`/`}>DUST</Link>
                    </div>
                  </div>
                </div>
                <nav className="ml-1 flex h-12 flex-1">
                  <ol role="list" className="flex items-center space-x-2">
                    <li>
                      <div className="flex items-center">
                        <ChevronRightIcon
                          className="mr-1 h-5 w-5 shrink pt-0.5 text-gray-400"
                          aria-hidden="true"
                        />
                        <Link
                          href={`/demo/qa`}
                          className="text-base font-bold text-gray-800"
                        >
                          answers
                        </Link>
                      </div>
                    </li>
                  </ol>
                </nav>
              </div>
            </div>
          </>
        )}
      </Disclosure>
      <div className="mx-auto mt-0 mt-4 flex max-w-4xl flex-col">
        <div className="flex flex-initial text-sm">
          <span className="text-gray-600">dataSource:</span>
          <span className="ml-1 font-bold text-violet-600">phrack</span>
          <span className="ml-2 text-gray-600">numResults:</span>
          <span className="ml-1 font-bold text-violet-600">16</span>
        </div>
        <div className="mt-2 flex flex-initial flex-row">
          <input
            type="text"
            name="query"
            className="block flex w-full flex-1 rounded-md border-gray-300 text-sm text-gray-700 shadow-sm focus:border-violet-500 focus:ring-violet-500"
            value={query}
            readOnly={true}
          ></input>
          <div className="ml-4 flex flex-initial cursor-pointer rounded-md bg-black px-4 py-2 text-white shadow-sm">
            <ArrowRightIcon className="mt-1 h-4 w-4"></ArrowRightIcon>
          </div>
        </div>
        <div className="mt-8 flex flex-initial text-sm">
          <div className="flex w-full flex-row">
            <div className="flex-initial font-bold text-gray-800">Answer</div>
            <div className="flex-1"></div>
            <div
              className={classNames(
                "ml-1 flex-initial cursor-pointer font-bold",
                answer === "short" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setAnswer("short")}
            >
              short
            </div>
            <div
              className={classNames(
                "ml-1 flex-initial cursor-pointer font-bold",
                answer === "1-pager" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setAnswer("1-pager")}
            >
              1-pager
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-initial whitespace-pre-wrap font-mono text-sm text-gray-800">
          {(answer === "short" ? short : onePager).split("References:")[0]}
        </div>

        <div className="flex flex-initial text-sm text-gray-400"></div>
        <div className="mt-8 flex flex-initial text-sm">
          <div className="flex w-full flex-row">
            <div className="flex-initial font-bold text-gray-800">
              References
            </div>
            <div className="flex-1"></div>
            <div className="flex-initial text-gray-600">sortBy:</div>
            <div
              className={classNames(
                "ml-1 flex-initial cursor-pointer font-bold",
                sort === "score" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setSort("score")}
            >
              relevance
            </div>
            <div
              className={classNames(
                "ml-1 flex flex-initial cursor-pointer font-bold",
                sort === "timestamp" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setSort("timestamp")}
            >
              date
            </div>
          </div>
        </div>
        <div className="mb-16 flex flex-initial">
          <ul className="w-full">
            {sortedResults.map((r) => (
              <li key={r.documentId} className="mt-4 w-full">
                <Result
                  documentId={r.documentId}
                  timestamp={r.timestamp}
                  facts={r.facts}
                  summary={r.summary}
                  score={r.score}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

export async function getStaticProps() {
  return {
    props: {
      run: RUN.run,
    },
  };
}
