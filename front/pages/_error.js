// pages/_error.js
import React from "react";

function CustomError({ statusCode, errorDetails }) {
  const errorMessage = errorDetails || "An unexpected error occurred.";

  const handleCopy = () => {
    void navigator.clipboard.writeText(`Error ${statusCode}: ${errorMessage}`);
    alert("Error details copied to clipboard!");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-red-600">
          {statusCode ? `Error ${statusCode}` : "An error occurred"}
        </h1>
        <p className="text-lg text-gray-700">{errorMessage}</p>
        <button
          onClick={handleCopy}
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Copy Error Details
        </button>
      </div>
    </div>
  );
}

CustomError.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  const errorDetails = err ? err.message : null;
  return { statusCode, errorDetails };
};

export default CustomError;
