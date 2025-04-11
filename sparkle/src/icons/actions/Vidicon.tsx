import type { SVGProps } from "react";
import * as React from "react";
const SvgVidicon = (props: SVGProps<SVGSVGElement>) => (
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
      d="m17 9.2 5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4.2Zm0 3.159 4 2.8V8.84l-4 2.8v.718ZM3 6v12h12V6H3Zm2 2h2v2H5V8Z"
    />
  </svg>
);
export default SvgVidicon;
