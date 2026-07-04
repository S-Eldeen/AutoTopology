import { useLayoutEffect, useRef } from 'react';

const MIN_HEIGHT = 24;

function maxPromptHeight() {
  if (typeof window === 'undefined') return 240;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const isMobile = window.matchMedia?.('(max-width: 640px)').matches;
  return Math.max(isMobile ? 112 : 160, Math.floor(viewportHeight * (isMobile ? 0.28 : 0.4)));
}

export function useAutoResizeTextarea(value) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const resize = () => {
      const maxHeight = maxPromptHeight();
      textarea.style.height = `${MIN_HEIGHT}px`;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${Math.max(MIN_HEIGHT, nextHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [value]);

  return ref;
}
