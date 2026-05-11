import type { SVGProps } from "react";
import * as React from "react";

const SvgAlignLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16 16.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm4-4a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm-4-4a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm4-4a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgAlignLeft;
