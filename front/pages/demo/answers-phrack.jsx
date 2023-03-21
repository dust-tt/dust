import { ActionButton } from "@app/components/Button";
import Head from "next/head";
import Script from "next/script";
import Link from "next/link";
import { Disclosure, Menu } from "@headlessui/react";
import {
  ChevronRightIcon,
  ComputerDesktopIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  ChevronDownIcon,
} from "@heroicons/react/20/solid";
import { classNames } from "@app/lib/utils";
import { useState } from "react";
import { timeAgoFrom } from "@app/lib/utils";
import { useEffect } from "react";

const { URL } = process.env;

// load local file ./run.json into variable RUN
const RUN = require("./run.json");

function Result({ documentId, summary, facts, timestamp, score }) {
  let [issue, article] = documentId.split("-").slice(1);
  const [factExpanded, setFactExpanded] = useState(false);

  return (
    <div className="flex flex-col w-full pt-2">
      <div className="flex flex-initial flex-row text-sm w-full">
        <div className="flex flex-initial font-bold text-violet-600">
          <Link
            href={`http://www.phrack.org/issues/${issue}/${article}.html#article`}
            target="_blank"
          >
            {documentId}
          </Link>
          <span className="text-gray-400 font-normal ml-2">
            (score: {score.toFixed(2)})
          </span>
        </div>
        <div className="flex-initial text-gray-600 ml-2 font-bold">
          {timeAgoFrom(timestamp)}
        </div>
      </div>
      <div className="flex flex-initial flex-row text-sm w-full mt-2 text-gray-600 max-w-2xl">
        {summary}
      </div>
      <div className="flex flex-initial flex-col text-sm w-full mt-1 text-gray-600 max-w-3xl">
        <div
          className="flex flex-initial font-bold text-gray-700 cursor-pointer"
          onClick={() => {
            setFactExpanded(!factExpanded);
          }}
        >
          {factExpanded ? (
            <ChevronDownIcon
              className="h-4 w-4 mt-0.5 text-gray-600 cursor-pointer"
              onClick={() => {
                setFactExpanded(false);
              }}
            />
          ) : (
            <ChevronRightIcon
              className="h-4 w-4 mt-0.5 text-gray-600 cursor-pointer"
              onClick={() => {
                setFactExpanded(true);
              }}
            />
          )}
          <span className="text-sm font-normal text-gray-400 italic">
            {facts.length} facts
          </span>
        </div>
        {factExpanded ? (
          <ul className="ml-4 list-disc space-y-0">
            {facts.map((fact, i) => (
              <li key={i} className="ml-4">
                <span
                  className={classNames(
                    "flex italic w-full mt-2 text-gray-600 bg-blue-50 rounded-sm p-1"
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
  }, [results, sort]);

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
                  <div className="flex flex-shrink-0 items-center pl-2 py-1">
                    <div className="flex rotate-[30deg]">
                      <div className="bg-gray-400 w-[4px] h-2 rounded-md"></div>
                      <div className="bg-white w-[1px] h-2"></div>
                      <div className="bg-gray-400 w-[4px] h-3 rounded-md"></div>
                    </div>
                    <div className="bg-white w-[4px] h-2"></div>
                    <div className="text-gray-800 font-bold text-base tracking-tight select-none">
                      <Link href={`/`}>DUST</Link>
                    </div>
                  </div>
                </div>
                <nav className="flex flex-1 ml-1 h-12">
                  <ol role="list" className="flex items-center space-x-2">
                    <li>
                      <div className="flex items-center">
                        <ChevronRightIcon
                          className="h-5 w-5 shrink text-gray-400 mr-1 pt-0.5"
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
      <div className="flex flex-col mt-0 max-w-4xl mx-auto mt-4">
        <div className="flex flex-initial text-sm">
          <span className="text-gray-600">dataSource:</span>
          <span className="ml-1 text-violet-600 font-bold">phrack</span>
          <span className="ml-2 text-gray-600">numResults:</span>
          <span className="ml-1 text-violet-600 font-bold">16</span>
        </div>
        <div className="flex flex-initial flex-row mt-2">
          <input
            type="text"
            name="query"
            className="flex flex-1 shadow-sm focus:ring-violet-500 focus:border-violet-500 block w-full text-sm border-gray-300 rounded-md text-gray-700"
            value={query}
            readOnly={true}
          ></input>
          <div className="shadow-sm ml-4 flex flex-initial bg-black text-white px-4 rounded-md py-2 cursor-pointer">
            <ArrowRightIcon className="h-4 w-4 mt-1"></ArrowRightIcon>
          </div>
        </div>
        <div className="flex flex-initial text-sm mt-8">
          <div className="flex flex-row w-full">
            <div className="flex-initial text-gray-800 font-bold">Answer</div>
            <div className="flex-1"></div>
            <div
              className={classNames(
                "flex-initial ml-1 font-bold cursor-pointer",
                answer === "short" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setAnswer("short")}
            >
              short
            </div>
            <div
              className={classNames(
                "flex-initial ml-1 font-bold cursor-pointer",
                answer === "1-pager" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setAnswer("1-pager")}
            >
              1-pager
            </div>
          </div>
        </div>
        <div className="flex flex-initial text-sm mt-4 whitespace-pre-wrap text-gray-800 font-mono">
          {(answer === "short" ? short : onePager).split("References:")[0]}
        </div>

        <div className="flex flex-initial text-gray-400 text-sm"></div>
        <div className="flex flex-initial text-sm mt-8">
          <div className="flex flex-row w-full">
            <div className="flex-initial text-gray-800 font-bold">
              References
            </div>
            <div className="flex-1"></div>
            <div className="flex-initial text-gray-600">sortBy:</div>
            <div
              className={classNames(
                "flex-initial ml-1 font-bold cursor-pointer",
                sort === "score" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setSort("score")}
            >
              relevance
            </div>
            <div
              className={classNames(
                "flex flex-initial ml-1 font-bold cursor-pointer",
                sort === "timestamp" ? "text-violet-600" : "text-gray-400"
              )}
              onClick={() => setSort("timestamp")}
            >
              date
            </div>
          </div>
        </div>
        <div className="flex flex-initial mb-16">
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
