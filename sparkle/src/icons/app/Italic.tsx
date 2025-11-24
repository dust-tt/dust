import type { SVGProps } from "react";
import * as React from "react";
const SvgItalic = (props: SVGProps<SVGSVGElement>) => (
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
      d="m3 21 1.385-2.77h3.184l5.123-12.46H8.538L9.923 3H21l-1.385 2.77h-3.184l-5.123 12.46h4.153L14.077 21H3Z"
    />
  </svg>
);
export default SvgItalic;
