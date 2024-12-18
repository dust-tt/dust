import type { SVGProps } from "react";
import * as React from "react";
const SvgDrive = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#0066DA"
      d="m2.663 19.598.97 1.75c.202.37.492.659.832.87l3.465-6.266H1c0 .408.1.816.302 1.185z"
    />
    <path
      fill="#00AC47"
      d="M12 8.581 8.535 2.316c-.34.21-.63.5-.832.869l-6.4 11.583c-.198.36-.303.768-.303 1.184h6.93z"
    />
    <path
      fill="#EA4335"
      d="M19.535 22.217c.34-.21.63-.5.832-.868l.403-.724 1.928-3.488c.201-.369.302-.777.302-1.185h-6.93l1.474 3.028z"
    />
    <path
      fill="#00832D"
      d="m12 8.581 3.465-6.265c-.34-.21-.73-.316-1.134-.316H9.669a2.27 2.27 0 0 0-1.134.316z"
    />
    <path
      fill="#2684FC"
      d="M16.07 15.952H7.93l-3.465 6.265c.34.211.73.316 1.134.316h12.802c.403 0 .794-.118 1.134-.316z"
    />
    <path
      fill="#FFBA00"
      d="m19.497 8.976-3.2-5.791a2.34 2.34 0 0 0-.832-.87L12 8.582l4.07 7.371h6.917c0-.408-.1-.816-.302-1.184z"
    />
  </svg>
);
export default SvgDrive;
