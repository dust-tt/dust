import * as React from "react";
import type { SVGProps } from "react";
const SvgCheckCircle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5ZM2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.186-2.86a.75.75 0 0 1 .174 1.046l-3.75 5.25a.75.75 0 0 1-1.14.094l-2.25-2.25a.75.75 0 1 1 1.06-1.06l1.624 1.624 3.236-4.53a.75.75 0 0 1 1.046-.174Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCheckCircle;
