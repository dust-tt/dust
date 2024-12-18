import type { SVGProps } from "react";
import * as React from "react";
const SvgBarChart = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.5 3h19c.552 0 .5-.052.5.5v17c0 .552.052.5-.5.5h-19c-.552 0-.5.052-.5-.5v-17c0-.552-.052-.5.5-.5M7 13v4h2v-4zm4-6v10h2V7zm4 3v7h2v-7z"
    />
  </svg>
);
export default SvgBarChart;
