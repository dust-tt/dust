import type { SVGProps } from "react";
import * as React from "react";

const SvgClari = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 45.9 39"
    {...props}
  >
    <path
      fill="#00D7B8"
      d="M44.5 7.4l-14 3.8c.6 2.6.9 5.4.9 8.3s-.3 5.7-.9 8.3l14 3.8c.9-3.8 1.4-7.9 1.4-12.1s-.5-8.3-1.4-12.1z"
    />
    <path
      fill="#5F3AD7"
      d="M9.2 3.5L0 19.5l14.6-10.9C13.2 6.5 11.3 4.8 9.2 3.5zM9.2 35.5L0 19.5l14.6 10.9C13.2 32.5 11.3 34.2 9.2 35.5z"
    />
    <path
      fill="#0280FF"
      d="M26 0L0 19.5l30.6-8.3C29.7 7 28.1 3.3 26 0zM26 39L0 19.5l30.6 8.3C29.7 32 28.1 35.7 26 39z"
    />
    <path
      fill="#FFFFFF"
      d="M31.5 19.5c0-2.9-.3-5.7-.9-8.3L0 19.5l30.6 8.3c.6-2.6.9-5.4.9-8.3z"
    />
  </svg>
);

export default SvgClari;
