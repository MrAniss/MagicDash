import React from 'react';

/**
 * Accordéon réutilisable avec lazy loading.
 * Les children ne sont rendus que lorsque `isOpen` est true — les consommateurs
 * peuvent ainsi conditionner leurs useQuery via `enabled: isOpen` pour ne fetch
 * que lorsque la section est ouverte.
 */
export default function AccordionSection({
  title,
  subtitle = null,
  badge = null,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-bg-page transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg
            className={`w-4 h-4 text-navy-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-base font-semibold text-navy truncate">{title}</h3>
          {badge != null && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-bg-page text-navy-muted border border-border">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-xs text-navy-muted flex-shrink-0 ml-3">{subtitle}</span>
        )}
      </button>

      {isOpen && (
        <div className="px-6 pb-6 pt-0 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}
