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
      d="M8.965 12a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m12 0a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m2.07 0A5.035 5.035 0 0 1 18 17.035H6a5.035 5.035 0 1 1 4.07-2.07h3.86A5.035 5.035 0 1 1 23.036 12"
    />
  </svg>
);
export default SvgVoicemail;
