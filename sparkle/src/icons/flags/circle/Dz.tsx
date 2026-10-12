import type { SVGProps } from "react";
import * as React from "react";

const SvgDz = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0c5.523 0 10 4.477 10 10s-4.477 10-10 10c0-.435-1.305-10-1.305-10z"
    />
    <path fill="#496E2D" d="M10 20C4.477 20 0 15.523 0 10S4.477 0 10 0" />
    <path
      fill="#D80027"
      d="m12.15 8.082-.821 1.13L10 8.783l.822 1.13-.82 1.13 1.328-.432.822 1.13-.001-1.398 1.328-.432-1.329-.431z"
    />
    <path
      fill="#D80027"
      d="M10.829 12.826a2.826 2.826 0 1 1 1.344-5.312 3.478 3.478 0 1 0 0 4.973c-.4.216-.858.34-1.344.34"
    />
  </svg>
);
export default SvgDz;
