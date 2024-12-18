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
      d="M22 20V4H2v16zM4 18h16V8.3l-8 7.2-8-7.2zm.434-12h15.132L12 12.81z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgMovingMail;
