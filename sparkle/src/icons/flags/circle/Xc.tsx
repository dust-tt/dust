import type { SVGProps } from "react";
import * as React from "react";

const SvgXc = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#D80027"
      d="M2.419 3.478q-.528.613-.952 1.305H18.53q-.424-.692-.951-1.305zM2.419 16.522h15.16q.528-.613.952-1.305H1.467q.424.692.952 1.305M8.72 8.171l.82 1.131 1.33-.43L10.048 10l.82 1.13L9.54 10.7l-.822 1.13v-1.397l-1.327-.433 1.328-.43z"
    />
    <path
      fill="#D80027"
      d="M6.481 12.826a2.826 2.826 0 1 1 1.345-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.345.34"
    />
  </svg>
);
export default SvgXc;
