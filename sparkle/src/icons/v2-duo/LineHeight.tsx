import type { SVGProps } from "react";
import * as React from "react";

const SvgLineHeight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 19.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zm0-18a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M11.322 5.831a1.54 1.54 0 0 1 1.193-.069l.164.07.133.075c.292.188.453.456.536.601.106.188.216.43.323.666l4.272 9.398a1.036 1.036 0 1 1-1.885.856l-1.542-3.392H9.485l-1.542 3.392a1.036 1.036 0 0 1-1.885-.856l4.271-9.398c.107-.236.217-.478.324-.666.094-.166.292-.49.669-.677m-.896 6.134h3.149L12 8.5z"
    />
  </svg>
);
export default SvgLineHeight;
