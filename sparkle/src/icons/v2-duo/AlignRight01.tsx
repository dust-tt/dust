import type { SVGProps } from "react";
import * as React from "react";

const SvgAlignRight01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.965 21V3a1.035 1.035 0 0 1 2.07 0v18a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M9.269 4.268a1.034 1.034 0 0 1 1.462 0l7 7a1.035 1.035 0 0 1 0 1.463l-7 7a1.034 1.034 0 1 1-1.462-1.463l5.233-5.233H3a1.035 1.035 0 0 1 0-2.07h11.502L9.269 5.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgAlignRight01;
