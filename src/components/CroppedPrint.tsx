import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { getDomCropStyle, PRINTS } from '../data/prints';

interface CroppedPrintProps {
  printIndex: number;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  elRef?: React.Ref<HTMLDivElement>;
}

export const CroppedPrint: React.FC<CroppedPrintProps> = ({
  printIndex,
  className = '',
  style,
  ariaLabel,
  elRef,
}) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof elRef === 'function') {
        elRef(node);
      } else if (elRef && 'current' in elRef) {
        (elRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [elRef],
  );

  const measure = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width || el.clientWidth;
    const h = rect.height || el.clientHeight;
    setSize((prev) => (Math.abs(prev.w - w) < 0.2 && Math.abs(prev.h - h) < 0.2 ? prev : { w, h }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = innerRef.current;
    if (!el) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, printIndex]);

  const print = PRINTS[printIndex] ?? PRINTS[0];
  const cropStyle = getDomCropStyle(print.crop, size.w, size.h);

  return (
    <div
      ref={setRefs}
      className={className}
      role="img"
      aria-label={ariaLabel ?? `${print.title} by ${print.artist}`}
      style={{
        backgroundColor: '#F6EAD8',
        ...cropStyle,
        ...style,
      }}
    />
  );
};
