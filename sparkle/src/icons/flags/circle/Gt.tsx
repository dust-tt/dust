import type { SVGProps } from "react";
import * as React from "react";

const SvgGt = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#338AF3"
      d="M20 10A10 10 0 0 0 14.348.992v18.016A10 10 0 0 0 20 10M0 10a10 10 0 0 0 5.652 9.008V.992A10 10 0 0 0 0 10"
    />
    <path
      fill="#ACABB1"
      d="M12.613 11.69 10.923 10l1.609-1.61-.073-.85-.46-.46L10 9.078 8.002 7.08l-.461.46-.073.85L9.078 10l-1.691 1.69.922.923L10 10.923l1.69 1.69z"
    />
    <path
      fill="#6DA544"
      d="m12.46 7.54-.923.923a2.174 2.174 0 1 1-3.074 0L7.54 7.54a3.478 3.478 0 1 0 4.919 0"
    />
  </svg>
);
export default SvgGt;
