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
    <path fill="#0ACF83" d="M6 18a3 3 0 0 1 3-3h3v3a3 3 0 1 1-6 0Z" />
    <path fill="#1ABCFE" d="M12 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0Z" />
    <path fill="#A259FF" d="M6 12a3 3 0 0 0 3 3h3V9H9a3 3 0 0 0-3 3Z" />
    <path fill="#FF7262" d="M12 3v6h3a3 3 0 1 0 0-6h-3Z" />
    <path fill="#F24E1E" d="M6 6a3 3 0 0 0 3 3h3V3H9a3 3 0 0 0-3 3Z" />
  </svg>
);
export default SvgFigma;
