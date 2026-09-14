import type { SVGProps } from "react";
import * as React from "react";

const SvgNetSuite = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#BACCDB"
      d="M3.948 7.967h3.476v8.257h1.73v3.227H3.949zm16.09 7.597H16.56V7.307h-1.73V4.08h5.206z"
    />
    <path
      fill="#125580"
      d="M3.141 3.288h10.986v9.43l-4.224-5.44H3.14zm17.688 16.97H9.844v-9.431l4.224 5.44h6.761"
    />
  </svg>
);
export default SvgNetSuite;
