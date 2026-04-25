import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Volume2,
  Play,
  Pause,
  Square,
  ZoomIn,
  ZoomOut,
  Type,
  RotateCcw,
  Accessibility,
  CheckCircle2,
  Mic,
} from 'lucide-react';
import { useAccessibility, FONT_SIZES, ZOOM_LEVELS } from '../contexts/AccessibilityContext';
import { useTheme } from '../contexts/ThemeContext';

function PanelContent() {
  const {
    fontSizeIndex,
    currentFontSize,
    increaseFontSize,
    decreaseFontSize,
    zoomIndex,
    currentZoom,
    increaseZoom,
    decreaseZoom,
    ttsActive,
    ttsPaused,
    ttsSupported,
    startTTS,
    pauseTTS,
    stopTTS,
    closePanel,
    resetAll,
    hasActiveFeatures,
  } = useAccessibility();

  const { isDarkMode } = useTheme();
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closePanel]);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      const firstFocusable = panel.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, []);

  const fontPercent = Math.round((currentFontSize / 16) * 100);
  const zoomPercent = Math.round(currentZoom * 100);
  const ttsStatus = ttsActive ? 'Reading...' : ttsPaused ? 'Paused' : 'Ready';

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-9998 bg-black/20 backdrop-blur-[2px]"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Accessibility Settings"
        className={`fixed top-0 right-0 h-full w-80 z-9999 flex flex-col shadow-2xl border-l transition-all duration-300
          ${isDarkMode
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
          }`}
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', zoom: 1 }}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0
            ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Accessibility className="w-4 h-4 text-white" />
            </div>
            <div>
              <div
                className={`font-semibold text-[14px] leading-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                Accessibility
              </div>
              <div className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Assistive Tools
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFeatures && (
              <button
                onClick={resetAll}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors
                  ${isDarkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                  }`}
                title="Reset all accessibility settings"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
            <button
              onClick={closePanel}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors
                ${isDarkMode
                  ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              aria-label="Close accessibility panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Text to Speech ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Volume2
                className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}
              />
              <span
                className={`text-[13px] font-semibold tracking-wide uppercase
                  ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
              >
                Text to Speech
              </span>
              {!ttsSupported && (
                <span className="ml-auto text-[10px] text-red-400 font-medium">Not supported</span>
              )}
            </div>

            {/* Status Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-[12px] font-medium
                ${ttsActive
                  ? isDarkMode ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200'
                  : ttsPaused
                    ? isDarkMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    : isDarkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-50 text-slate-500 border border-slate-200'
                }`}
            >
              <Mic className={`w-3.5 h-3.5 ${ttsActive ? 'animate-pulse' : ''}`} />
              <span>{ttsStatus}</span>
              {ttsActive && (
                <span className="ml-auto flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-0.5 bg-blue-500 rounded-full animate-bounce"
                      style={{ height: '12px', animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              )}
            </div>

            {/* TTS Controls */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={startTTS}
                disabled={!ttsSupported || ttsActive}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-all
                  ${ttsActive
                    ? isDarkMode
                      ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-600 border border-blue-300 cursor-not-allowed'
                    : !ttsSupported
                      ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                      : isDarkMode
                        ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-blue-500/20 hover:text-blue-300 hover:border-blue-500/30'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                  }`}
                aria-label="Read page aloud"
              >
                <Play className={`w-4 h-4 ${ttsActive ? 'fill-current' : ''}`} />
                {ttsPaused ? 'Resume' : 'Read'}
              </button>

              <button
                onClick={pauseTTS}
                disabled={!ttsSupported || !ttsActive}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-all
                  ${!ttsActive || !ttsSupported
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                  }`}
                aria-label="Pause reading"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>

              <button
                onClick={stopTTS}
                disabled={!ttsSupported || (!ttsActive && !ttsPaused)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-all
                  ${(!ttsActive && !ttsPaused) || !ttsSupported
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                  }`}
                aria-label="Stop reading"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </div>

            <p className={`text-[11px] mt-2 leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Reads the current page content aloud using your device's speech engine.
            </p>
          </section>

          {/* Divider */}
          <div className={`border-t ${isDarkMode ? 'border-slate-700/60' : 'border-slate-200'}`} />

          {/* ── Font Size ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Type className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <span
                className={`text-[13px] font-semibold tracking-wide uppercase
                  ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
              >
                Font Size
              </span>
              {fontSizeIndex > 0 && (
                <span className={`ml-auto flex items-center gap-1 text-[11px] font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              )}
            </div>

            {/* Font size display */}
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl mb-3 border
                ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
            >
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Text scale
              </span>
              <span className={`text-[13px] font-semibold tabular-nums
                ${fontSizeIndex > 0
                  ? isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                  : isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                {fontPercent}%
              </span>
            </div>

            {/* Size steps visual */}
            <div className="flex gap-1.5 mb-3">
              {FONT_SIZES.map((size, i) => (
                <div
                  key={size}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-300
                    ${i <= fontSizeIndex
                      ? isDarkMode ? 'bg-emerald-500' : 'bg-emerald-500'
                      : isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={decreaseFontSize}
                disabled={fontSizeIndex === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-all
                  ${fontSizeIndex === 0
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                  }`}
                aria-label="Decrease font size"
              >
                <span className="text-base leading-none" style={{ fontSize: '14px' }}>A</span>
                <span className="text-[10px] opacity-70">▼</span>
              </button>

              <button
                onClick={increaseFontSize}
                disabled={fontSizeIndex === FONT_SIZES.length - 1}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all
                  ${fontSizeIndex === FONT_SIZES.length - 1
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                  }`}
                aria-label="Increase font size"
              >
                <span className="font-semibold leading-none" style={{ fontSize: '17px' }}>A</span>
                <span className="text-[10px] opacity-70">▲</span>
              </button>
            </div>

            {/* Font size labels */}
            <div className="flex justify-between mt-1.5 px-1">
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Smaller</span>
              <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Larger</span>
            </div>
          </section>

          {/* Divider */}
          <div className={`border-t ${isDarkMode ? 'border-slate-700/60' : 'border-slate-200'}`} />

          {/* ── Magnifier / Zoom ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ZoomIn className={`w-4 h-4 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
              <span
                className={`text-[13px] font-semibold tracking-wide uppercase
                  ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
              >
                Magnifier
              </span>
              {zoomIndex > 0 && (
                <span className={`ml-auto flex items-center gap-1 text-[11px] font-medium ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`}>
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              )}
            </div>

            {/* Zoom display */}
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl mb-3 border
                ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
            >
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Page zoom
              </span>
              <span className={`text-[13px] font-semibold tabular-nums
                ${zoomIndex > 0
                  ? isDarkMode ? 'text-violet-400' : 'text-violet-700'
                  : isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>
                {zoomPercent}%
              </span>
            </div>

            {/* Zoom step visual */}
            <div className="flex gap-1.5 mb-3">
              {ZOOM_LEVELS.map((level, i) => (
                <div
                  key={level}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-300
                    ${i <= zoomIndex
                      ? isDarkMode ? 'bg-violet-500' : 'bg-violet-500'
                      : isDarkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={decreaseZoom}
                disabled={zoomIndex === 0}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all
                  ${zoomIndex === 0
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-violet-500/20 hover:text-violet-300 hover:border-violet-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200'
                  }`}
                aria-label="Decrease zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
                Zoom Out
              </button>

              <button
                onClick={increaseZoom}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-medium transition-all
                  ${zoomIndex === ZOOM_LEVELS.length - 1
                    ? 'opacity-40 cursor-not-allowed ' + (isDarkMode ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-slate-100 text-slate-400 border border-slate-200')
                    : isDarkMode
                      ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-violet-500/20 hover:text-violet-300 hover:border-violet-500/30'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200'
                  }`}
                aria-label="Increase zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                Zoom In
              </button>
            </div>

            <p className={`text-[11px] mt-2 leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Scales the entire page for better visibility.
            </p>
          </section>

          {/* Divider */}
          <div className={`border-t ${isDarkMode ? 'border-slate-700/60' : 'border-slate-200'}`} />

          {/* ── Keyboard Shortcuts ── */}
          <section>
            <p className={`text-[12px] font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Keyboard Shortcuts
            </p>
            <div className="space-y-1.5">
              {[
                { key: 'Esc', desc: 'Close panel' },
                { key: 'Alt + A', desc: 'Open accessibility' },
              ].map(({ key, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{desc}</span>
                  <kbd
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border
                      ${isDarkMode
                        ? 'bg-slate-800 border-slate-600 text-slate-300'
                        : 'bg-slate-100 border-slate-300 text-slate-600'
                      }`}
                  >
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-4 border-t shrink-0
            ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}
        >
          <div className={`flex items-center gap-1.5 text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            <Accessibility className="w-3.5 h-3.5" />
            <span>PWD Assistive Tools — ALERT-CIA v1.0</span>
          </div>
          <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`}>
            Settings persist across page navigation
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function AccessibilityPanel() {
  const { isPanelOpen } = useAccessibility();

  if (!isPanelOpen) return null;
  return <PanelContent />;
}

/** Floating trigger button for the accessibility panel */
export function AccessibilityButton() {
  const { isPanelOpen, togglePanel, hasActiveFeatures } = useAccessibility();
  const { isDarkMode } = useTheme();

  return (
    <button
      onClick={togglePanel}
      aria-label="Open accessibility tools"
      aria-expanded={isPanelOpen}
      aria-haspopup="dialog"
      title="Accessibility Tools (Alt+A)"
      className={`relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500
        ${isPanelOpen
          ? isDarkMode
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
            : 'bg-blue-50 text-blue-600 border border-blue-200'
          : isDarkMode
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent hover:border-slate-700'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200'
        }`}
    >
      <Accessibility className="w-4.5 h-4.5" />
      {hasActiveFeatures && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white dark:border-slate-900"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
