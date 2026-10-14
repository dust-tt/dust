import type { SVGProps } from "react";
import * as React from "react";

const SvgLa = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M19.008 5.652A10 10 0 0 0 10 0 10 10 0 0 0 .992 5.652l9.008.87zM.992 14.348A10 10 0 0 0 10 20a10 10 0 0 0 9.008-5.652L10 13.478z"
    />
    <path
      fill="#0052B4"
      d="M19.008 5.652H.992A9.96 9.96 0 0 0 0 10a9.96 9.96 0 0 0 .992 4.348h18.016A9.96 9.96 0 0 0 20 10a9.96 9.96 0 0 0-.992-4.348"
    />
    <path
      fill="#F0F0F0"
      d="M10 13.478a3.478 3.478 0 1 0 0-6.956 3.478 3.478 0 0 0 0 6.956"
    />
  </svg>
);
export default SvgLa;
