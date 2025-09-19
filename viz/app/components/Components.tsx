"use client";

import React from "react";

export function Spinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="flex space-x-2">
        <div
          className="w-3 h-3 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        ></div>
        <div
          className="w-3 h-3 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        ></div>
        <div
          className="w-3 h-3 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        ></div>
      </div>
    </div>
  );
}
