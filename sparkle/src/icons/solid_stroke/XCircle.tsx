import * as React from "react";
import type { SVGProps } from "react";
const SvgXCircle = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm6.97-2.78a.75.75 0 0 1 1.06 0L12 10.94l1.72-1.72a.75.75 0 1 1 1.06 1.06L13.06 12l1.72 1.72a.75.75 0 1 1-1.06 1.06L12 13.06l-1.72 1.72a.75.75 0 1 1-1.06-1.06L10.94 12l-1.72-1.72a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgXCircle;
