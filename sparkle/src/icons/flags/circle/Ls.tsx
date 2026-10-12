import type { SVGProps } from "react";
import * as React from "react";

const SvgLs = (props: SVGProps<SVGSVGElement>) => (
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
      d="M0 10a9.96 9.96 0 0 0 .992 4.348l9.008.435 9.008-.435A9.96 9.96 0 0 0 20 10a9.96 9.96 0 0 0-.992-4.348L10 5.217l-9.008.435A9.96 9.96 0 0 0 0 10"
    />
    <path
      fill="#6DA544"
      d="M10 20a10 10 0 0 0 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#0052B4"
      d="M10 0A10 10 0 0 0 .992 5.652h18.016A10 10 0 0 0 10 0"
    />
    <path
      fill="#000"
      d="M10.651 9.783V7.39H9.347v2.392L7.77 11.358a2.607 2.607 0 0 0 4.456 0z"
    />
  </svg>
);
export default SvgLs;
