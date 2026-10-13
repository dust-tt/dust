import type { SVGProps } from "react";
import * as React from "react";

const SvgVc = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M14.782 1.216A9.96 9.96 0 0 0 10 0C8.267 0 6.638.44 5.217 1.216L4.347 10l.87 8.784A9.96 9.96 0 0 0 10 20c1.732 0 3.362-.44 4.782-1.216l.87-8.784z"
    />
    <path
      fill="#338AF3"
      d="M5.217 18.784V1.216A10 10 0 0 0 0 10a10 10 0 0 0 5.217 8.784"
    />
    <path
      fill="#6DA544"
      d="M20 10a10 10 0 0 0-5.217-8.784v17.568A10 10 0 0 0 20.001 10M7.825 12.609 6.085 10l1.74-2.609L9.565 10zM12.175 12.609 10.435 10l1.74-2.609L13.914 10zM10 16.087l-1.738-2.609L10 10.87l1.739 2.608z"
    />
  </svg>
);
export default SvgVc;
