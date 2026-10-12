import type { SVGProps } from "react";
import * as React from "react";

const SvgDo = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.344 12.609a10.02 10.02 0 0 0 7.047 7.047v-7.047z"
    />
    <path fill="#0052B4" d="M7.39.344A10.02 10.02 0 0 0 .345 7.391H7.39z" />
    <path fill="#D80027" d="M19.656 7.391A10.02 10.02 0 0 0 12.61.344v7.047z" />
    <path
      fill="#0052B4"
      d="M12.61 19.656a10.02 10.02 0 0 0 7.046-7.047H12.61z"
    />
    <path
      fill="#496E2D"
      d="M12.608 10a2.609 2.609 0 1 1-5.217 0c0-1.44 2.608-2.609 2.608-2.609S12.608 8.56 12.608 10"
    />
    <path fill="#0052B4" d="M7.39 10a2.609 2.609 0 1 1 5.218 0" />
    <path
      fill="#D80027"
      d="M8.533 8.696v1.63a1.467 1.467 0 0 0 2.935 0v-1.63z"
    />
  </svg>
);
export default SvgDo;
