import React from "react";

interface StatusCardProps {
  title: string;
  message: string;
  status: "success" | "error" | "warning" | "info" | "loading";
  details?: string[];
  actions?: React.ReactNode;
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  message,
  status,
  details = [],
  actions,
  className = "",
}) => {
  const statusConfig = {
    success: {
      icon: "✅",
      bgColor: "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 dark:shadow-[0_8px_32px_rgba(34,197,94,0.15)]",
      borderColor: "border-green-200 dark:border-green-500/40",
      textColor: "text-green-900 dark:text-green-200",
      iconBg: "bg-green-100 dark:bg-green-600/30 dark:shadow-[0_0_20px_rgba(34,197,94,0.3)]",
    },
    error: {
      icon: "❌",
      bgColor: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 dark:shadow-[0_8px_32px_rgba(239,68,68,0.15)]",
      borderColor: "border-red-200 dark:border-red-500/40",
      textColor: "text-red-900 dark:text-red-200",
      iconBg: "bg-red-100 dark:bg-red-600/30 dark:shadow-[0_0_20px_rgba(239,68,68,0.3)]",
    },
    warning: {
      icon: "⚠️",
      bgColor: "bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 dark:shadow-[0_8px_32px_rgba(234,179,8,0.15)]",
      borderColor: "border-yellow-200 dark:border-yellow-500/40",
      textColor: "text-yellow-900 dark:text-yellow-200",
      iconBg: "bg-yellow-100 dark:bg-yellow-600/30 dark:shadow-[0_0_20px_rgba(234,179,8,0.3)]",
    },
    info: {
      icon: "ℹ️",
      bgColor: "bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 dark:shadow-[0_8px_32px_rgba(59,130,246,0.15)]",
      borderColor: "border-blue-200 dark:border-blue-500/40",
      textColor: "text-blue-900 dark:text-blue-200",
      iconBg: "bg-blue-100 dark:bg-blue-600/30 dark:shadow-[0_0_20px_rgba(59,130,246,0.3)]",
    },
    loading: {
      icon: "⏳",
      bgColor: "bg-gradient-to-br from-gray-50 to-slate-50 dark:from-[#1e2540] dark:to-[#252a41] dark:shadow-[0_8px_32px_rgba(100,116,139,0.1)]",
      borderColor: "border-gray-200 dark:border-[#3a4a6a]/40",
      textColor: "text-gray-900 dark:text-slate-100",
      iconBg: "bg-gray-100 dark:bg-[#2d3350] dark:shadow-[0_0_20px_rgba(100,116,139,0.2)]",
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`
        relative border rounded-lg p-4
        transition-all duration-200 ease-in-out
        ${config.bgColor}
        ${config.borderColor}
        ${config.textColor}
        ${className}
      `.trim()}
    >
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center text-base flex-shrink-0`}>
            {status === "loading" ? (
              <div className="w-4 h-4 animate-spin rounded-full border-b-2 border-current"></div>
            ) : (
              config.icon
            )}
          </div>
          <h3 className="text-base font-semibold">{title}</h3>
        </div>

        {/* Message */}
        <p className="text-sm mb-3 leading-snug opacity-90">{message}</p>

        {/* Details */}
        {details.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold mb-2 opacity-75">详细信息:</h4>
            <div className="space-y-1.5">
              {details.map((detail, index) => (
                <div
                  key={index}
                  className="p-2 rounded bg-black/5 dark:bg-white/5 text-xs leading-snug"
                >
                  {detail}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {actions && (
          <div className="flex flex-wrap gap-2 mt-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};