import React from "react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors";

  const variantClasses = {
    primary: "bg-blue-600 hover:bg-blue-700 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-700 dark:hover:from-blue-500 dark:hover:to-blue-600 text-white focus:ring-blue-500 dark:shadow-[0_0_20px_rgba(59,130,246,0.3)] dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]",
    secondary:
      "bg-gray-200 hover:bg-gray-300 dark:bg-[#252a41] dark:hover:bg-[#2d3350] text-gray-900 dark:text-slate-100 focus:ring-gray-500 dark:border dark:border-[#3a4a6a]/50 dark:hover:shadow-[0_0_15px_rgba(100,116,139,0.2)]",
    danger: "bg-red-600 hover:bg-red-700 dark:bg-gradient-to-r dark:from-red-600 dark:to-red-700 dark:hover:from-red-500 dark:hover:to-red-600 text-white focus:ring-red-500 dark:shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]",
    success: "bg-green-600 hover:bg-green-700 dark:bg-gradient-to-r dark:from-green-600 dark:to-green-700 dark:hover:from-green-500 dark:hover:to-green-600 text-white focus:ring-green-500 dark:shadow-[0_0_20px_rgba(34,197,94,0.3)] dark:hover:shadow-[0_0_30px_rgba(34,197,94,0.5)]",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const disabledClasses = "opacity-50 cursor-not-allowed";

  const finalClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${disabled || loading ? disabledClasses : ""}
    ${className}
  `.trim();

  return (
    <button
      className={finalClasses}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading && (
        <div className="w-4 h-4 mr-2 animate-spin rounded-full border-b-2 border-current"></div>
      )}
      {children}
    </button>
  );
};
