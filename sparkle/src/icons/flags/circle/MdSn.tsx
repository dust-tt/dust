import type { SVGProps } from "react";
import * as React from "react";

const SvgMdSn = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#A2001D"
      d="M19.655 7.391C18.507 3.134 14.619 0 9.999 0S1.491 3.134.344 7.391l9.655.435zM.344 12.609C1.49 16.866 5.379 20 9.999 20s8.508-3.134 9.656-7.391l-9.656-.435z"
    />
    <path
      fill="#6DA544"
      d="M19.656 7.391H.343A10 10 0 0 0 0 10c0 .903.12 1.777.344 2.609h19.312A10 10 0 0 0 20 9.999c0-.902-.12-1.776-.344-2.608"
    />
  </svg>
);
export default SvgMdSn;
