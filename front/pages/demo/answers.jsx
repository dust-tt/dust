import { ActionButton } from "@app/components/Button";
import Head from "next/head";
import Script from "next/script";
import Link from "next/link";
import { Disclosure, Menu } from "@headlessui/react";
import {
  ChevronRightIcon,
  ComputerDesktopIcon,
  ArrowRightIcon,
} from "@heroicons/react/20/solid";
import { classNames } from "@app/lib/utils";
import { useState } from "react";

const { URL } = process.env;

function Result({ documentId, answer, timestamp, chunks }) {
  return <div className="flex flex-col"></div>;
}

export default function DemoQA({}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([
    {
      documentId: "phrack29-012",
      timestamp: Date.now(),
      chunks: [],
    },
  ]);

  const handleGo = () => {
    setResults([]);
  };

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
          <span className="ml-1 text-violet-600 font-bold">Phrack-E29</span>
          <span className="ml-2 text-gray-600">numResults:</span>
          <span className="ml-1 text-violet-600 font-bold">16</span>
        </div>
        <div className="flex flex-initial flex-row mt-2">
          <input
            type="text"
            name="query"
            className="flex flex-1 shadow-sm focus:ring-violet-500 focus:border-violet-500 block w-full text-sm border-gray-300 rounded-md text-gray-700"
            valye={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab" || e.key == "Enter") {
                if (query.length > 0) {
                  console.log("GO", query);
                }
              }
            }}
          ></input>
          <div
            className="shadow-sm ml-4 flex flex-initial bg-black text-white px-4 rounded-md py-2 cursor-pointer"
            onClick={() => {
              if (query.length > 0) {
                console.log("GO", query);
              }
            }}
          >
            <ArrowRightIcon className="h-4 w-4 mt-1"></ArrowRightIcon>
          </div>
        </div>
        <div className="flex flex-initial text-sm mt-8">
          <span className="text-gray-800 font-bold"># Answer</span>
        </div>
        <div className="flex flex-initial text-gray-400 text-sm"></div>
        <div className="flex flex-initial text-sm mt-8">
          <div className="flex flex-row w-full">
            <div className="flex-initial text-gray-800 font-bold">
              # Results
            </div>
            <div className="flex-1"></div>
            <div className="flex-initial text-gray-600">sortBy:</div>
            <div className="flex-initial ml-1 font-bold text-violet-600">
              relevance
            </div>
            <div className="flex flex-initial ml-1 font-bold text-gray-400">
              date
            </div>
          </div>
        </div>
        <div className="flex flex-initial">
          <ul></ul>
        </div>
      </div>
    </main>
  );
}
