import React from "react";

import { ScrollFadeInText } from "@app/components/home/ScrollFadeInText";

export function ScrollTextDemo() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-24 py-32">
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Built for ops teams.</h2>
        <ScrollFadeInText
          text="No technical background required. Subject-matter experts can use Relevance to design powerful AI agents without relying on developer resources."
          startColor="text-gray-300"
          endColor="text-gray-900"
          className="text-xl font-medium"
          mode="word"
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">
          Scale excellence across every area or team.
        </h2>
        <ScrollFadeInText
          text="With your intelligent, purpose-built AI workforce."
          startColor="text-gray-300"
          endColor="text-gray-900"
          className="text-xl font-medium"
          threshold={0.2}
          mode="character"
          staggerDelay={20}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">
          Dust creates core building blocks
        </h2>
        <ScrollFadeInText
          text="for AI to connect your team's knowledge and workflows."
          startColor="text-gray-300"
          endColor="text-gray-900"
          className="text-xl font-medium"
          threshold={0.3}
          mode="word"
          staggerDelay={80}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">
          Character-by-character animation
        </h2>
        <ScrollFadeInText
          text="Like OS primitives for computers, Dust creates core building blocks for AI."
          startColor="text-gray-300"
          endColor="text-gray-900"
          className="text-xl font-medium"
          threshold={0.2}
          mode="character"
          staggerDelay={10}
        />
      </div>
    </div>
  );
}
