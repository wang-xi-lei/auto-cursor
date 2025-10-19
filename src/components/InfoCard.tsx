import React, { useState } from "react";

interface InfoCardProps {
  title: string;
  value: string;
  copyable?: boolean;
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
  children?: React.ReactNode;
}

export const InfoCard: React.FC<InfoCardProps> = ({
  title,
  value,
  copyable = false,
  variant = "default",
  className = "",
  children,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyable) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const variantClasses = {
    default: "bg-white dark:bg-gradient-to-br dark:from-[#1e2540] dark:to-[#252a41] border-gray-200 dark:border-[#3a4a6a]/40 dark:shadow-[0_4px_16px_rgba(59,130,246,0.06)]",
    primary: "bg-blue-50 dark:bg-gradient-to-br dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-500/40 dark:shadow-[0_4px_16px_rgba(59,130,246,0.15)]",
    success: "bg-green-50 dark:bg-gradient-to-br dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-500/40 dark:shadow-[0_4px_16px_rgba(34,197,94,0.15)]",
    warning: "bg-yellow-50 dark:bg-gradient-to-br dark:from-yellow-900/30 dark:to-yellow-800/30 border-yellow-200 dark:border-yellow-500/40 dark:shadow-[0_4px_16px_rgba(234,179,8,0.15)]",
    danger: "bg-red-50 dark:bg-gradient-to-br dark:from-red-900/30 dark:to-red-800/30 border-red-200 dark:border-red-500/40 dark:shadow-[0_4px_16px_rgba(239,68,68,0.15)]",
  };

  const textColorClasses = {
    default: "text-gray-900 dark:text-slate-100",
    primary: "text-blue-900 dark:text-blue-200",
    success: "text-green-900 dark:text-green-200",
    warning: "text-yellow-900 dark:text-yellow-200",
    danger: "text-red-900 dark:text-red-200",
  };

  return (
    <div
      className={`
        relative border rounded-lg p-3 
        transition-all duration-150 ease-in-out
        hover:shadow-sm
        ${variantClasses[variant]}
        ${textColorClasses[variant]}
        ${className}
      `.trim()}
    >
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium opacity-75 truncate flex-1">{title}</h3>
        {copyable && (
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 dark:hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all flex-shrink-0"
            title={copied ? "已复制!" : "复制"}
          >
            <div className="text-xs">
              {copied ? (
                <span className="text-green-600 dark:text-green-400">✓</span>
              ) : (
                <span className="opacity-50 hover:opacity-100">📋</span>
              )}
            </div>
          </button>
        )}
      </div>
      
      <div className="space-y-2">
        <p className="font-mono text-xs break-all leading-tight bg-black/5 dark:bg-white/5 rounded p-2">
          {value}
        </p>
        {children}
      </div>
    </div>
  );
};