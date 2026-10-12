import type { SVGProps } from "react";
import * as React from "react";

const SvgIq = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path
      fill="#000"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#496E2D"
      d="M7.609 9.348H5.681a.87.87 0 0 1 .841-.652V7.39a2.176 2.176 0 0 0-2.174 2.174v1.087H7.61c.12 0 .217.098.217.218v.434H3.48v1.305H9.13v-1.74c0-.838-.683-1.521-1.522-1.521M10.869 11.304V7.391H9.564v5.218h2.174v-1.305zM15.217 11.304V7.391h-1.304v3.913h-.435V10h-1.304v2.609h3.913v-1.305z"
    />
  </svg>
);
export default SvgIq;
