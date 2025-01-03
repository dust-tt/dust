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
      d="M2.5 3h19c.552 0 .5-.052.5.5v17c0 .552.052.5-.5.5h-19c-.552 0-.5.052-.5-.5v-17c0-.552-.052-.5.5-.5ZM4 5v14h16V5H4Zm3 8h2v4H7v-4Zm4-6h2v10h-2V7Zm4 3h2v7h-2v-7Z"
    />
  </svg>
);
export default SvgBarChart;
