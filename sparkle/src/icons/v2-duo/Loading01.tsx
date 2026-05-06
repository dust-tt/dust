import type { SVGProps } from "react";
import * as React from "react";

const SvgLoading01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.018 15.518a1.035 1.035 0 0 1 1.464 1.464L5.653 19.81a1.034 1.034 0 1 1-1.463-1.464zm10 1.5a1.035 1.035 0 0 1 1.464 0l.707.707a1.035 1.035 0 0 1-1.463 1.464l-.707-.707a1.035 1.035 0 0 1 0-1.464M4.399 4.478a1.034 1.034 0 0 1 1.462 0l2.122 2.12a1.035 1.035 0 0 1-1.464 1.464L4.398 5.94a1.034 1.034 0 0 1 0-1.463m13.535.206a1.035 1.035 0 0 1 1.463 1.463l-1.414 1.415a1.035 1.035 0 0 1-1.463-1.464z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M10.965 22v-4a1.035 1.035 0 0 1 2.07 0v4a1.035 1.035 0 0 1-2.07 0M5.75 10.965a1.035 1.035 0 0 1 0 2.07h-3.5a1.035 1.035 0 0 1 0-2.07zm15.5 0a1.035 1.035 0 0 1 0 2.07h-1.5a1.035 1.035 0 0 1 0-2.07zM10.965 4.75v-2.5a1.035 1.035 0 0 1 2.07 0v2.5a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgLoading01;
