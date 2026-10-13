import type { SVGProps } from "react";
import * as React from "react";

const SvgGn = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.48.622A10 10 0 0 0 10 0C8.779 0 7.607.22 6.524.622L6.088 10l.435 9.378A10 10 0 0 0 10 20c1.223 0 2.395-.22 3.478-.622L13.914 10z"
    />
    <path
      fill="#D80027"
      d="M0 10c0 4.3 2.714 7.965 6.522 9.378V.622A10 10 0 0 0 0 10"
    />
    <path
      fill="#6DA544"
      d="M20 10c0-4.3-2.713-7.965-6.521-9.378v18.756A10 10 0 0 0 20 10"
    />
  </svg>
);
export default SvgGn;
