import type { SVGProps } from "react";
import * as React from "react";

const SvgMa = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#6DA544"
      d="M15.91 8.207h-4.515L10 3.914 8.605 8.207H4.09l3.652 2.652-1.394 4.293L10 12.5l3.652 2.652-1.394-4.293zm-7.144 2.32.472-1.453h1.528l.472 1.453-1.234.899zm1.714-2.32h-.96l.48-1.48zm1.497 1.785-.297-.914h1.554zm-3.653-.914-.297.914-1.257-.914zM8 12.878l.48-1.48.778.567zm2.738-.913.778-.567.48 1.48z"
    />
  </svg>
);
export default SvgMa;
