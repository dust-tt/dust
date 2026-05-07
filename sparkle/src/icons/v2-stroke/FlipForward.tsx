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
      d="M1.965 13.5A5.535 5.535 0 0 1 7.5 7.965h11.002L16.269 5.73A1.034 1.034 0 1 1 17.73 4.27l4 4a1.034 1.034 0 0 1 0 1.462l-4 4a1.034 1.034 0 1 1-1.462-1.463l2.233-2.233H7.5a3.465 3.465 0 1 0 0 6.93H12a1.035 1.035 0 0 1 0 2.07H7.5A5.535 5.535 0 0 1 1.965 13.5"
    />
  </svg>
);
export default SvgFlipForward;
