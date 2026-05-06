import type { SVGProps } from "react";
import * as React from "react";

const SvgCode02 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6.268 6.268a1.034 1.034 0 1 1 1.463 1.463L3.463 12l4.268 4.268a1.034 1.034 0 1 1-1.463 1.463l-5-5a1.034 1.034 0 0 1 0-1.463zm10 0a1.034 1.034 0 0 1 1.463 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.463-1.463L20.538 12 16.269 7.73a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M12.99 2.775a1.036 1.036 0 0 1 2.02.45l-4 18a1.036 1.036 0 0 1-2.02-.45z"
    />
  </svg>
);
export default SvgCode02;
