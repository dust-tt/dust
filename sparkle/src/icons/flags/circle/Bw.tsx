import type { SVGProps } from "react";
import * as React from "react";

const SvgBw = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.472 6.956A10 10 0 0 0 0 10a10 10 0 0 0 .472 3.043l9.528.435 9.528-.435c.306-.96.472-1.982.472-3.043a10 10 0 0 0-.472-3.044L10 6.522z"
    />
    <path
      fill="#000"
      d="M20 10q-.001-.89-.151-1.74H.15a10 10 0 0 0 0 3.48H19.85q.15-.85.151-1.74"
    />
    <path
      fill="#338AF3"
      d="M10 20c4.462 0 8.24-2.922 9.528-6.957H.473C1.76 17.078 5.539 20 10 20M10 0C5.54 0 1.76 2.922.474 6.956h19.055C18.241 2.923 14.462 0 10.001 0"
    />
  </svg>
);
export default SvgBw;
