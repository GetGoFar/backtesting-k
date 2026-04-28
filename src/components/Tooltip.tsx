"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// ============================================================================
// TOOLTIP — Redesign con portal para evitar clipping
// ============================================================================

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function Tooltip({ content, children, wide }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const show = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
    setIsVisible(true);
  }, []);

  const hide = useCallback(() => {
    setIsVisible(false);
  }, []);

  const maxWidth = wide ? "max-w-md" : "max-w-sm";

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="relative inline-flex items-center cursor-help"
      >
        {children}
      </div>
      {mounted &&
        isVisible &&
        createPortal(
          <div
            className={`fixed z-[9999] ${maxWidth} w-max pointer-events-none`}
            style={{
              left: `${coords.x}px`,
              top: `${coords.y}px`,
              transform: "translate(-50%, -100%) translateY(-10px)",
            }}
          >
            <div className="bg-brand-navy text-white text-sm leading-relaxed rounded-xl px-4 py-3 shadow-2xl border border-white/10">
              {content}
            </div>
            <div className="flex justify-center -mt-1">
              <div className="w-3 h-3 bg-brand-navy rotate-45 rounded-sm" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// Icono de información para usar con tooltips
export function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 text-slate-400 hover:text-brand-coral transition-colors ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
