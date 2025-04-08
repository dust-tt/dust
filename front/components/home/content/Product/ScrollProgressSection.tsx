import React from "react";

import { ScrollProgressText } from "@app/components/home/ScrollProgressText";

export function ScrollProgressSection() {
  return (
    <div className="w-full py-16">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          <ScrollProgressText
            text="Like OS primitives for computers, Dust creates core building blocks for AI to connect your team's knowledge and workflows."
            startColor="text-gray-300"
            endColor="text-gray-900"
            scrollDistance={600}
          />
        </div>
      </div>
    </div>
  );
}
