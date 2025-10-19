import React from "react";

interface PageSectionProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PageSection: React.FC<PageSectionProps> = ({
  title,
  subtitle,
  icon,
  right,
  children,
  className = "",
}) => {
  return (
    <section className={`bg-white dark:bg-gradient-to-br dark:from-[#1a1f35] dark:to-[#1e2540] rounded-xl shadow-sm ring-1 ring-gray-100 dark:ring-[#2a3a5a]/30 dark:shadow-[0_8px_32px_rgba(59,130,246,0.08)] ${className}`}>
      {(title || right) && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-[#2a3a5a]/30 flex items-center justify-between dark:bg-gradient-to-r dark:from-blue-500/5 dark:to-purple-500/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon && <span className="text-lg">{icon}</span>}
              {title && (
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</h2>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-gray-500 dark:text-blue-200/60">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
};