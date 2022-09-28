import { useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { useSession, signIn, signOut } from "next-auth/react";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";
import { ComputerDesktopIcon } from "@heroicons/react/20/solid";

export default function Home() {
  return (
    <>
      <Head>
        <title>Dust - LLM Apps Platform</title>
      </Head>

      <main className="mx-auto mt-16 max-w-5xl px-4 mt-12">

        <div className="mb-12 flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
          <div className="flex flex-shrink-0 items-center px-2 py-1 block scale-150">
            <div className="flex rotate-[30deg]">
              <div className="bg-gray-400 w-[4px] h-2 rounded-md"></div>
              <div className="bg-white w-[1px] h-2"></div>
              <div className="bg-gray-400 w-[4px] h-3 rounded-md"></div>
            </div>
            <div className="bg-white w-[4px] h-2"></div>
            <div className="text-gray-800 font-black text-base tracking-tight select-none">
              DUST
            </div>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block xl:inline">
              Specification language and design platform for
            </span>{" "}
            <span className="block text-indigo-600 xl:inline">LLM Apps</span>
          </h1>

          <div className="mx-auto mt-5 max-w-md sm:justify-center mt-12">
            <button
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              onClick={() => signIn("github", { callbackUrl: '/api/login' })}
            >
              <ComputerDesktopIcon
                className="-ml-1 mr-3 h-5 w-5"
                aria-hidden="true"
              />
              Sign in with Github
            </button>
          </div>
        </div>
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
    props: { session },
  };
}
