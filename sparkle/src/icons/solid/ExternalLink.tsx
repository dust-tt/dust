import type { SVGProps } from "react";
import * as React from "react";
const SvgExternalLink = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M19 11h3V3h-8v3h2.983C15.49 8.777 12.24 10.5 9 10.5v3c3.748 0 7.737-1.796 10-5.05V11Z"
    />
    <path fill="#000" d="M7 7h4V5H5v14h14v-5h-2v3H7V7Z" />
  </svg>
);
export default SvgExternalLink;
