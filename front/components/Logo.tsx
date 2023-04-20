import Link from "next/link";

import { classNames } from "@app/lib/utils";

export function Logo() {
  return (
    <div className="mx-4 mt-8 flex flex-row items-center">
      <div className="flex rotate-[30deg]">
        <div className="h-4 w-[8px] rounded-xl bg-gray-400"></div>
        <div className="h-4 w-[2px] bg-white"></div>
        <div className="h-6 w-[8px] rounded-xl bg-gray-400"></div>
      </div>
      <div className="flex h-4 w-[8px] bg-white"></div>
      <div className="flex text-2xl font-bold tracking-tight text-gray-800">
        <Link href="/">DUST</Link>
      </div>
    </div>
  );
}

export function PulseLogo({ animated }: { animated: boolean }) {
  return (
    <div
      className={classNames(
        "flex flex-row items-center",
        animated ? "animate-pulse" : ""
      )}
    >
      <div className="flex rotate-[30deg]">
        <div className="h-4 w-[8px] rounded-xl bg-gray-400"></div>
        <div className="h-4 w-[2px] bg-white"></div>
        <div className="h-6 w-[8px] rounded-xl bg-gray-400"></div>
      </div>
    </div>
  );
}
