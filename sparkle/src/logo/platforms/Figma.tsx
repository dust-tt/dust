import type { SVGProps } from "react";
import * as React from "react";

const SvgFigma = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#0ACF83" d="M4 20a4 4 0 0 1 4-4h4v4a4 4 0 0 1-8 0" />
    <path fill="#1ABCFE" d="M12 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0" />
    <path fill="#A259FF" d="M4 12a4 4 0 0 0 4 4h4V8H8a4 4 0 0 0-4 4" />
    <path fill="#FF7262" d="M12 0v8h4a4 4 0 0 0 0-8z" />
    <path fill="#F24E1E" d="M4 4a4 4 0 0 0 4 4h4V0H8a4 4 0 0 0-4 4" />
  </svg>
);
export default SvgFigma;
