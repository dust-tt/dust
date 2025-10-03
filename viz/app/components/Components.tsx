"use client";

export const Spinner = () => {
  return (
    <div className="flex items-center justify-center min-h-32">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent border-solid rounded-full animate-spin"></div>
    </div>
  );
};
