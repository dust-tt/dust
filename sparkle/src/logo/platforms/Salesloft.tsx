import type { SVGProps } from "react";
import * as React from "react";

const SvgSalesloft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#B4D625"
      d="M16.672 19.758c0-1.037.83-1.918 1.918-1.918 1.142 0 1.972.881 1.972 1.918 0 1.038-.83 1.92-1.92 1.92-1.192.05-1.97-.882-1.97-1.92"
    />
    <path
      fill="#06492E"
      d="M7.319 5.924c0-1.348 1.296-2.437 2.956-2.437 2.126 0 3.422.985 4.148 6.12h.467l.674-7.001C10.741.946 4.83 2.709 4.726 7.739c0 5.445 8.66 5.445 8.66 10.424 0 1.452-1.296 2.437-2.748 2.437-3.838 0-4.72-3.215-4.927-6.586h-.466L4 20.341S6.852 22 9.912 22c3.682-.052 6.119-2.748 6.222-5.6 0-5.445-8.815-6.586-8.815-10.476"
    />
  </svg>
);
export default SvgSalesloft;
