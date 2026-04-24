import { useState, useEffect } from 'react';

export default function AccordionSection({ title, children, badge, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasBeenOpened, setHasBeenOpened] = useState(defaultOpen);

  // Déclencher le chargement dès qu'on clique sur "ouvrir"
  const handleToggle = () => {
    if (!isOpen) {
      setHasBeenOpened(true);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-bg-page transition-colors outline-none text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-navy">{title}</h3>
          {badge && (
            <span className="text-[10px] font-bold text-white bg-navy px-2 py-0.5 rounded-full uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-navy-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <div
        className={`transition-all duration-500 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 pb-6 pt-2 border-t border-border/40">
          {hasBeenOpened && children}
        </div>
      </div>
    </div>
  );
}
