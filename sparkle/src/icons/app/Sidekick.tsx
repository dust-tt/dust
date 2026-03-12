import type { SVGProps } from "react";
import * as React from "react";

const SvgSidekick = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M22 16a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-2.89l2.02 2.246a3 3 0 0 0 3.488.717l2.816-1.3a4 4 0 0 1 3.352 0l2.816 1.3a3 3 0 0 0 3.488-.717L22 13.11zM8.963 12.089c.022.134.037.27.037.411a2.5 2.5 0 0 1-5 0c0-.657.255-1.253.67-1.7zM19.329 10.8c.415.446.671 1.042.671 1.699a2.5 2.5 0 1 1-4.964-.411zm-6.782-5.04L16 3l-.6 3H18a4 4 0 0 1 4 4v.454l-2.278-1.242a4 4 0 0 0-4.269.276l-1.1.801a4 4 0 0 1-4.706 0l-1.1-.8a4 4 0 0 0-4.269-.277L2 10.454V10a4 4 0 0 1 4-4h1.25l6.25-5z"
    />
  </svg>
);
export default SvgSidekick;
