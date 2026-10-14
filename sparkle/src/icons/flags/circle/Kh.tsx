import type { SVGProps } from "react";
import * as React from "react";

const SvgKh = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M0 10c0 1.732.44 3.362 1.216 4.783l8.784.87 8.784-.87A9.96 9.96 0 0 0 20 10c0-1.732-.44-3.362-1.216-4.783L10 4.347l-8.784.87A9.96 9.96 0 0 0 0 10"
    />
    <path
      fill="#0052B4"
      d="M1.217 5.217h17.568A10 10 0 0 0 10.001 0a10 10 0 0 0-8.784 5.217M10 20a10 10 0 0 0 8.785-5.217H1.217A10 10 0 0 0 10 20"
    />
    <path
      fill="#F0F0F0"
      d="M13.478 11.957v-1.305h-.87V8.913l-.869-.87-.87.87v-1.74L10 6.305l-.87.87v1.739l-.869-.87-.87.87v1.74h-.87v1.303h-.869v1.305h8.696v-1.304z"
    />
  </svg>
);
export default SvgKh;
