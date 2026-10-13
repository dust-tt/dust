import type { SVGProps } from "react";
import * as React from "react";

const SvgSr = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#A2001D"
      d="M19.378 6.522H.622A10 10 0 0 0 0 10c0 1.223.22 2.395.622 3.478h18.756A10 10 0 0 0 20 10c0-1.223-.22-2.395-.622-3.478"
    />
    <path
      fill="#6DA544"
      d="M10.03 20a9.99 9.99 0 0 0 8.249-4.348h-16.5A9.99 9.99 0 0 0 10.03 20M10.03 0a9.99 9.99 0 0 1 8.249 4.348h-16.5A9.99 9.99 0 0 1 10.03 0"
    />
    <path
      fill="#FFDA44"
      d="m10 6.522.862 2.657h2.794l-2.26 1.642.863 2.657L10 11.836l-2.26 1.642.863-2.657-2.26-1.642h2.794z"
    />
  </svg>
);
export default SvgSr;
