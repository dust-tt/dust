import type { SVGProps } from "react";
import * as React from "react";
const SvgMail = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 4v16H2V4h20Zm-2 4.238-7.928 7.1L4 8.216V18h16V8.238ZM4.511 6l7.55 6.662L19.502 6H4.511Z"
    />
  </svg>
);
export default SvgMail;
