import React from "react";
import { useState, useEffect } from "react";
import { getDS } from "../lib/connect";

const browser = require("webextension-polyfill");

// need trigger because for some reason when you have a listener in Popup.jsx it's not working
export function IndexView() {
  const [ds_choices, setDSChoices] = useState([]);

  useEffect(() => {
    getDS().then((choices) => {
      setDSChoices(choices.map((ds_choice) => ds_choice.name));
    });
  }, []);

  function index(e) {
    e.preventDefault();
    let ds = new FormData(e.target).get("ds_name");
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      browser.tabs.sendMessage(tabs[0].id, {
        type: "doc_request",
        ds: ds,
      });
      console.log("Message sent to content script");
      window.close();
    });
  }
  // why does my input need onChange in react

  return (
    <form onSubmit={(e) => index(e)} className="m-auto flex w-full p-4">
      <div className="mb-4">
        <label
          className="mb-2 block text-sm font-bold text-gray-700"
          htmlFor="ds_name"
        >
          Data Source Name
        </label>
        <select
          name="ds_name"
          className="block w-full appearance-none rounded border border-gray-200 bg-gray-200 px-4 py-3 pr-8 leading-tight text-gray-700 focus:border-gray-500 focus:bg-white focus:outline-none"
          id="grid-state"
        >
          {ds_choices.map((ds_choice, i) => (
            <option key={i}>{ds_choice}</option>
          ))}
        </select>
      </div>
      <input
        className="focus:shadow-outline m-4 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 focus:outline-none"
        type="submit"
        value="Index"
      />
    </form>
  );
}
