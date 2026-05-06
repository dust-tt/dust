import type { SVGProps } from "react";
import * as React from "react";

const SvgVoicemail = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18 14.965a1.035 1.035 0 0 1 0 2.07H6a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M8.965 12a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m12 0a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m-9.93 0a5.035 5.035 0 1 1-10.07 0 5.035 5.035 0 0 1 10.07 0m12 0a5.035 5.035 0 1 1-10.07 0 5.035 5.035 0 0 1 10.07 0"
    />
  </svg>
);
export default SvgVoicemail;
