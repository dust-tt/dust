import type { SVGProps } from "react";
import * as React from "react";

const SvgCodeSnippet01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.268 5.268a1.034 1.034 0 1 1 1.463 1.463L3.463 12l5.268 5.268a1.034 1.034 0 1 1-1.463 1.463l-6-6a1.034 1.034 0 0 1 0-1.463zm8 0a1.034 1.034 0 0 1 1.463 0l6 6a1.034 1.034 0 0 1 0 1.463l-6 6a1.034 1.034 0 1 1-1.463-1.463L20.538 12 15.269 6.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgCodeSnippet01;
