import React from "react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "warning";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  icon,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  className = "",
}) => {
  const variantClasses = {
    primary: "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-500/40 hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-800/40 dark:hover:to-blue-700/40 text-blue-900 dark:text-blue-200 dark:shadow-[0_4px_16px_rgba(59,130,246,0.1)] dark:hover:shadow-[0_8px_24px_rgba(59,130,246,0.25)]",
    secondary: "bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#1e2540] dark:to-[#252a41] border-gray-200 dark:border-[#3a4a6a]/40 hover:from-gray-100 hover:to-gray-200 dark:hover:from-[#252a41] dark:hover:to-[#2d3350] text-gray-900 dark:text-slate-100 dark:shadow-[0_4px_16px_rgba(100,116,139,0.1)] dark:hover:shadow-[0_8px_24px_rgba(100,116,139,0.2)]",
    danger: "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-red-200 dark:border-red-500/40 hover:from-red-100 hover:to-red-200 dark:hover:from-red-800/40 dark:hover:to-red-700/40 text-red-900 dark:text-red-200 dark:shadow-[0_4px_16px_rgba(239,68,68,0.1)] dark:hover:shadow-[0_8px_24px_rgba(239,68,68,0.25)]",
    warning: "bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 border-yellow-200 dark:border-yellow-500/40 hover:from-yellow-100 hover:to-yellow-200 dark:hover:from-yellow-800/40 dark:hover:to-yellow-700/40 text-yellow-900 dark:text-yellow-200 dark:shadow-[0_4px_16px_rgba(234,179,8,0.1)] dark:hover:shadow-[0_8px_24px_rgba(234,179,8,0.25)]",
  };

  const disabledClasses = "opacity-50 cursor-not-allowed pointer-events-none";

  return (
    <div
      className={`
        relative overflow-hidden group cursor-pointer
        border rounded-lg p-3 
        transition-all duration-150 ease-in-out
        hover:shadow-md
        ${variantClasses[variant]}
        ${disabled || loading ? disabledClasses : ""}
        ${className}
      `.trim()}
      onClick={!disabled && !loading ? onClick : undefined}
    >
      {/* Content */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-2xl">
          {loading ? (
            <div className="w-6 h-6 animate-spin rounded-full border-b-2 border-current"></div>
          ) : (
            icon
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mb-0.5 truncate">{title}</h3>
          <p className="text-xs opacity-70 line-clamp-1">{description}</p>
        </div>
      </div>
    </div>
  );
};