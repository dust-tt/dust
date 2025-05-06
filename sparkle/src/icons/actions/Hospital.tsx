import type { SVGProps } from "react";
import * as React from "react";
const SvgHospital = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 20v-6h8v6h3V4H5v16h3Zm2 0h4v-4h-4v4Zm11 0h2v2H1v-2h2V2h18v18ZM11 8V6h2v2h2v2h-2v2h-2v-2H9V8h2Z"
    />
  </svg>
);
export default SvgHospital;
