import type { SVGProps } from "react";
import * as React from "react";

const SvgBz = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#0052B4"
      d="M20 10c0-3.432-1.73-6.46-4.364-8.26L10 1.303l-5.636.435A9.99 9.99 0 0 0 0 10a9.99 9.99 0 0 0 4.364 8.26l5.636.436 5.636-.435A9.99 9.99 0 0 0 20 10"
    />
    <path
      fill="#A2001D"
      d="M15.636 1.74A9.95 9.95 0 0 0 9.999 0C7.91 0 5.97.642 4.363 1.74zM4.363 18.26A9.95 9.95 0 0 0 10 20c2.091 0 4.032-.642 5.637-1.74z"
    />
    <path
      fill="#F0F0F0"
      d="M10 14.783a4.783 4.783 0 1 0 0-9.565 4.783 4.783 0 0 0 0 9.565"
    />
    <path
      fill="#6DA544"
      d="M10 13.913a3.913 3.913 0 1 0 .001-7.826 3.913 3.913 0 0 0 0 7.826"
    />
    <path
      fill="#F0F0F0"
      d="M10 12.609a2.609 2.609 0 1 0 0-5.218 2.609 2.609 0 0 0 0 5.218"
    />
    <path fill="#0052B4" d="M10 9.348 8.589 10v1.087l1.413.87 1.413-.87V10z" />
    <path fill="#FFDA44" d="M8.588 8.696h2.826V10H8.588z" />
  </svg>
);
export default SvgBz;
