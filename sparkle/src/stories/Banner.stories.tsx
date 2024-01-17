import type { Meta } from "@storybook/react";
import React from "react";

import { Banner } from "@sparkle/components/Banner";

const meta = {
  title: "Molecule/Banner",
  component: Banner,
} satisfies Meta<typeof Banner>;

export default meta;

export const BasicBanner = () => {
  return (
    <div className="s-h-full s-w-full">
      <Banner
        classNames="s-bg-indigo-600"
        ctaLabel="Register now"
        label="Join us in Denver from June 7 – 9 to see what’s coming next&nbsp;"
        onClick={() => {
          alert(`Button clicked`);
        }}
        title="GeneriCon 2023"
      />
    </div>
  );
};
