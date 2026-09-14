import type { SVGProps } from "react";
import * as React from "react";

const SvgPdf = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#ED756C"
      d="M4 6.8c0-1.68 0-2.52.327-3.162a3 3 0 0 1 1.311-1.311C6.28 2 7.12 2 8.8 2h6.4c1.68 0 2.52 0 3.162.327a3 3 0 0 1 1.311 1.311C20 4.28 20 5.12 20 6.8v10.4c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C17.72 22 16.88 22 15.2 22H8.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C4 19.72 4 18.88 4 17.2z"
    />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M8 15H7v-5h1.5a1.5 1.5 0 0 1 0 3H8zm0-3h.5a.5.5 0 0 0 0-1H8z"
      clipRule="evenodd"
    />
    <path
      fill="#fff"
      d="M15 15h1v-2h1v-1h-1v-.2c0-.28 0-.42.055-.527a.5.5 0 0 1 .218-.218C16.38 11 16.52 11 16.8 11h.2v-1c-.465 0-.698 0-.888.051a1.5 1.5 0 0 0-1.06 1.06C15 11.303 15 11.536 15 12z"
    />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M11 15v-5h.6c.84 0 1.26 0 1.581.164a1.5 1.5 0 0 1 .656.655c.163.32.163.74.163 1.581v.2c0 .84 0 1.26-.164 1.581a1.5 1.5 0 0 1-.655.656c-.32.163-.74.163-1.581.163zm1.2-1c.28 0 .42 0 .527-.055a.5.5 0 0 0 .218-.218C13 13.62 13 13.48 13 13.2v-1.4c0-.28 0-.42-.055-.527a.5.5 0 0 0-.218-.218C12.62 11 12.48 11 12.2 11H12v3z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgPdf;
