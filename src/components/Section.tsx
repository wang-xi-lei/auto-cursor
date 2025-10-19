import React from "react";

interface SectionProps {
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  children,
  className = "",
  compact = false,
}) => {
  return (
    <section
      className={`
        relative border rounded-lg
        bg-white dark:bg-slate-800
        border-gray-200 dark:border-slate-700
        ${compact ? "p-3" : "p-4"}
        ${className}
      `.trim()}
    >
      {(title || description) && (
        <header className="mb-3">
          {typeof title === "string" ? (
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          ) : (
            title
          )}
          {description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">
              {description}
            </p>
          )}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
};