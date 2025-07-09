import type { SVGProps } from "react";
import * as React from "react";
const SvgFilm = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2 2.993a681.7 681.7 0 0 0 20 0v18.014a681.7 681.7 0 0 0-20 0V2.993ZM8 5v14h8V5H8ZM4 5v2h2V5H4Zm14 0v2h2V5h-2ZM4 9v2h2V9H4Zm14 0v2h2V9h-2ZM4 13v2h2v-2H4Zm14 0v2h2v-2h-2ZM4 17v2h2v-2H4Zm14 0v2h2v-2h-2Z"
    />
  </svg>
);
export default SvgFilm;
