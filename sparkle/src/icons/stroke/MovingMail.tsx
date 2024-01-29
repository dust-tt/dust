import type { SVGProps } from "react";
import * as React from "react";
const SvgMovingMail = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M22 3v18H2v-2h18V7.3l-8 7.2-10-9V3h20Zm-2.434 2H4.434L12 11.81 19.566 5Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M8 15v2H0v-2h8ZM5 10v2H0v-2h5Z" />
  </svg>
);
export default SvgMovingMail;
