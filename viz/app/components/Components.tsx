"use client";

// We can't use Sparkle components in the viz app,
// because of client-side rendering issue.
// So we define the components here.

export const Button = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600"
    >
      {label}
    </button>
  );
};

export const ErrorMessage = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => {
  return (
    <div className="bg-pink-100 border-l-4 border-pink-500 rounded-lg p-4 max-w-md">
      <div className="flex items-center mb-2">
        <svg
          className="w-6 h-6 text-pink-500 mr-2"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <h3 className="text-lg font-semibold text-pink-800">{title}</h3>
      </div>
      <div className="text-pink-700">{children}</div>
    </div>
  );
};

export const Spinner = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent border-solid rounded-full animate-spin"></div>
    </div>
  );
};
