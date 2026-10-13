import type { SVGProps } from "react";
import * as React from "react";

const SvgEt = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10c0 1.223.22 2.395.622 3.478l9.378.87 9.378-.87A10 10 0 0 0 20 10a10 10 0 0 0-.605-3.434L10 5.652l-9.395.914A10 10 0 0 0 0 10"
    />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#6DA544"
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path
      fill="#0052B4"
      d="M10 14.783a4.783 4.783 0 1 0 0-9.565 4.783 4.783 0 0 0 0 9.565"
    />
    <path
      fill="#FFDA44"
      d="m10 6.297.863 2.657h2.798l-2.265 1.642.87 2.665L10 11.61l-2.263 1.647.867-2.662L6.34 8.954h2.796z"
    />
    <path
      fill="#FFDA44"
      d="m13.443 10.661-2.739-.89 1.693-2.33-.703-.51L10 9.26 8.308 6.93l-.703.51 1.692 2.33-2.738.89.268.827 2.74-.89v2.88h.869v-2.88l2.739.89z"
    />
  </svg>
);
export default SvgEt;
