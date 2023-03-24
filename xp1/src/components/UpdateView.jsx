import React from "react";
import { Logo } from "./Logo";

export function UpdateView({ update }) {
  console.log("UPDATE", update);
  return (
    <div className="absolute h-screen w-full overflow-hidden bg-gray-700 text-sm text-gray-100">
      <div className="flex h-full flex-col items-center">
        <div className="flex flex-1"></div>
        <div className="flex h-16 flex-row items-center">
          <div className="flex">
            <Logo animated />
          </div>
          <div className="ml-2 flex font-bold">DUST</div>
        </div>
        <div className="flex">
          Update to version{" "}
          {update.accepted_versions[update.accepted_versions.length - 1]} is
          required.
        </div>
        <div className="mt-4 flex h-32 text-gray-500">
          Visit
          <div
            className="mx-0.5 cursor-pointer text-sky-600"
            onClick={() => {
              chrome.tabs.create({ url: update.update_url });
            }}
          >
            {update.update_url}
          </div>
          to update.
        </div>
        <div className="flex flex-1"></div>
      </div>
    </div>
  );
}
