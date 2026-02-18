import type { SVGProps } from "react";
import * as React from "react";

const SvgBigQuery = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#3BA256" d="M11 9h2v10h-2zM8 12h2v6H8zM14 14h2v4h-2z" />
    <path
      fill="#FBBC05"
      fillRule="evenodd"
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-3a6 6 0 1 0 0-12 6 6 0 0 0 0 12"
      clipRule="evenodd"
    />
    <path
      fill="#4285F4"
      fillRule="evenodd"
      d="m17.215 19.336 3.284 3.285 2.122-2.122-3.285-3.284A8.96 8.96 0 0 0 21 12a8.97 8.97 0 0 0-2.67-6.397l-2.094 2.148A5.98 5.98 0 0 1 18 12a6 6 0 0 1-2.952 5.17z"
      clipRule="evenodd"
    />
    <path
      fill="#EA4335"
      fillRule="evenodd"
      d="M16.243 7.757A6 6 0 0 0 6 12H3a9 9 0 0 1 15.364-6.364z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgBigQuery;
