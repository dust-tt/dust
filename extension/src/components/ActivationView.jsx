import React from "react";

const browser = require("webextension-polyfill");

export function ActivationView({ onActivate }) {
  browser.storage.local.set({ onboarding: true });
  return (
    <div className="p-4">
      <p className="mb-2">Click this button and login to set up!</p>
      <a
        className="focus:shadow-outline rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none"
        href="https://dust.tt"
        target="_blank"
      >
        Start onboarding
      </a>
    </div>
  );
}
