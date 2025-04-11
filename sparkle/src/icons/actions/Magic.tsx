import type { SVGProps } from "react";
import * as React from "react";
const SvgMagic = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M9.348 5.715a2 2 0 0 0 1.394-.213l4.61-2.586.354 5.028a2 2 0 0 0 .677 1.363l4.019 3.522-4.83 1.912a2 2 0 0 0-1.123 1.123l-1.913 4.83-3.522-4.018a2 2 0 0 0-1.363-.677l-5.027-.355 2.586-4.61a2 2 0 0 0 .212-1.393L4.364 4.657l4.984 1.058Zm1.716 1.9 2.514-1.41.19 2.7a2 2 0 0 0 .678 1.364l2.175 1.906-2.59 1.025a2 2 0 0 0-1.123 1.123l-1.026 2.59-1.906-2.174a2 2 0 0 0-1.364-.677l-2.7-.19 1.41-2.515a2 2 0 0 0 .213-1.394l-.576-2.71 2.711.574a2 2 0 0 0 1.394-.212Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m17.435 16.02-1.414 1.415 4.242 4.243 1.415-1.415-4.243-4.242Z"
    />
  </svg>
);
export default SvgMagic;
