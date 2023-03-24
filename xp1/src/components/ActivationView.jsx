import React from "react";
import { useState } from "react";
import { Logo } from "./Logo";
import { getUser, setSecret } from "../lib/user";

export function ActivationView({ onActivate }) {
  const [activationKey, setActivationKey] = useState("");
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    let user = await getUser(activationKey);
    console.log("USER", user);
    if (user.status !== "ready") {
      setError("Invalid activation key");
    } else {
      await setSecret(activationKey);
      onActivate();
    }
  };

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
          <input
            type="text"
            placeholder="Activation key"
            value={activationKey}
            onChange={(e) => {
              setActivationKey(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
            className="w-96 rounded-md bg-gray-800 p-2 text-gray-100 focus:outline focus:outline-gray-900"
          />
        </div>
        <div className="mt-4 flex h-28 text-gray-500">
          Visit
          <div
            className="mx-0.5 cursor-pointer text-sky-600"
            onClick={() => {
              chrome.tabs.create({ url: "https://dust.tt/xp1" });
            }}
          >
            dust.tt/xp1
          </div>
          to get your activation key.
        </div>

        <div className="mt-4 flex h-4 text-red-500">{error ? error : " "}</div>
        <div className="flex flex-1"></div>
      </div>
    </div>
  );
}
