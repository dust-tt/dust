import type { SVGProps } from "react";
import * as React from "react";

const SvgFlipForward = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1.965 13.5A5.535 5.535 0 0 1 7.5 7.965H21a1.035 1.035 0 0 1 0 2.07H7.5a3.465 3.465 0 1 0 0 6.93H12a1.035 1.035 0 0 1 0 2.07H7.5A5.535 5.535 0 0 1 1.965 13.5"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M16.269 4.269a1.034 1.034 0 0 1 1.463 0l4 4a1.034 1.034 0 0 1 0 1.462l-4 4a1.034 1.034 0 1 1-1.463-1.462L19.538 9l-3.269-3.269a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgFlipForward;
