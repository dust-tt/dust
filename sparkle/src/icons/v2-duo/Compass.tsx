import type { SVGProps } from "react";
import * as React from "react";

const SvgCompass = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.223 14.253a1.035 1.035 0 0 1 1.553 1.369A13 13 0 0 1 12 20.035c-3.894 0-7.39-1.709-9.777-4.413a1.036 1.036 0 0 1 1.553-1.37A10.94 10.94 0 0 0 12 17.966c3.274 0 6.213-1.434 8.223-3.712"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M13.465 6.5a1.465 1.465 0 1 0-2.93 0 1.465 1.465 0 0 0 2.93 0m2.07 0c0 .928-.358 1.772-.943 2.402l7.304 12.579a1.036 1.036 0 0 1-1.791 1.038L12.802 9.943a3.54 3.54 0 0 1-1.605 0L3.896 22.52a1.036 1.036 0 0 1-1.791-1.04L9.407 8.903a3.537 3.537 0 0 1 1.558-5.783V2a1.035 1.035 0 0 1 2.07 0v1.12a3.54 3.54 0 0 1 2.5 3.38"
    />
  </svg>
);
export default SvgCompass;
