import type { SVGProps } from "react";
import * as React from "react";

const SvgMd = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14.348.992A9.96 9.96 0 0 0 10.001 0a9.96 9.96 0 0 0-4.348.992L4.783 10l.87 9.008A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 4.347-.992l.87-9.008z"
    />
    <path
      fill="#0052B4"
      d="M5.652.993A10 10 0 0 0 0 10a10 10 0 0 0 5.652 9.007z"
    />
    <path
      fill="#D80027"
      d="M14.348.993v18.014A10 10 0 0 0 20 10 10 10 0 0 0 14.348.993"
    />
    <path
      fill="#FF9811"
      d="M13.478 7.868h-2.391a1.087 1.087 0 0 0-2.174 0H6.52c0 .59.515 1.07 1.106 1.07h-.035c0 .591.479 1.07 1.07 1.07 0 .524.376.959.872 1.052l-.843 1.903a3.47 3.47 0 0 0 2.618 0l-.844-1.903a1.07 1.07 0 0 0 .873-1.052c.59 0 1.07-.479 1.07-1.07h-.036c.591 0 1.106-.48 1.106-1.07"
    />
    <path fill="#0052B4" d="M10 9.348 8.589 10v1.304l1.413.87 1.413-.87V10z" />
    <path fill="#D80027" d="M8.588 8.696h2.826V10H8.588z" />
  </svg>
);
export default SvgMd;
