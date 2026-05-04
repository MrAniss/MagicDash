import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

// Indeterminate top loading bar — animates while at least one query/mutation
// is in flight. We can't show a real % (single JSON response, no granular
// progress) so we fake the feeling with a shimmer animation.
//
// Small delay before showing (200ms) so cache-warm hits don't flash the bar,
// and a brief "complete" state on finish so the bar visibly fills before fading.
export default function TopProgressBar() {
  const fetching  = useIsFetching();
  const mutating  = useIsMutating();
  const isActive  = fetching + mutating > 0;

  // visible: true while bar is on screen (active OR finishing-out)
  // showFull: true for the brief moment we slide to 100% before hiding
  const [visible, setVisible] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    let showTimer;
    let hideTimer;
    let completeTimer;

    if (isActive) {
      // Delay showing so blink-fast queries don't trigger the bar
      showTimer = setTimeout(() => {
        setShowFull(false);
        setVisible(true);
      }, 200);
    } else if (visible) {
      // Slide to "100%" then fade out
      setShowFull(true);
      completeTimer = setTimeout(() => setVisible(false), 250);
    }

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(completeTimer);
    };
  }, [isActive, visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[2px] z-[9999] pointer-events-none overflow-hidden"
      role="progressbar"
      aria-busy={isActive}
      aria-label="Chargement"
    >
      {showFull ? (
        <div
          className="h-full w-full bg-mint-dark transition-opacity duration-200"
          style={{ opacity: showFull ? 1 : 0 }}
        />
      ) : (
        <div className="h-full w-full bg-mint-dark/15">
          <div className="h-full w-1/3 bg-mint-dark animate-progress-shimmer" />
        </div>
      )}
    </div>
  );
}
