import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

export const FONT_SIZES = [16, 18, 20, 22];
export const ZOOM_LEVELS = [1, 1.1, 1.2, 1.35];

const FONT_LABELS = ['Default (16px)', 'Large (18px)', 'X-Large (20px)', 'XX-Large (22px)'];
const ZOOM_LABELS = ['100%', '110%', '120%', '135%'];

const AccessibilityContext = createContext();

export function AccessibilityProvider({ children }) {
  const [fontSizeIndex, setFontSizeIndex] = useState(() => {
    const saved = localStorage.getItem('a11y-font-size');
    const idx = saved ? parseInt(saved, 10) : 0;
    return isNaN(idx) ? 0 : Math.min(Math.max(idx, 0), FONT_SIZES.length - 1);
  });

  const [zoomIndex, setZoomIndex] = useState(() => {
    const saved = localStorage.getItem('a11y-zoom');
    const idx = saved ? parseInt(saved, 10) : 0;
    return isNaN(idx) ? 0 : Math.min(Math.max(idx, 0), ZOOM_LEVELS.length - 1);
  });

  const [ttsActive, setTtsActive] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const utteranceRef = useRef(null);

  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Apply font size to CSS variable
  useEffect(() => {
    const size = FONT_SIZES[fontSizeIndex];
    document.documentElement.style.setProperty('--font-size', `${size}px`);
    localStorage.setItem('a11y-font-size', String(fontSizeIndex));
  }, [fontSizeIndex]);

  // Persist zoom
  useEffect(() => {
    localStorage.setItem('a11y-zoom', String(zoomIndex));
  }, [zoomIndex]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (ttsSupported) window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  // Font size controls
  const increaseFontSize = useCallback(() =>
    setFontSizeIndex(prev => Math.min(prev + 1, FONT_SIZES.length - 1)), []);
  const decreaseFontSize = useCallback(() =>
    setFontSizeIndex(prev => Math.max(prev - 1, 0)), []);
  const resetFontSize = useCallback(() => setFontSizeIndex(0), []);

  // Zoom controls
  const increaseZoom = useCallback(() =>
    setZoomIndex(prev => Math.min(prev + 1, ZOOM_LEVELS.length - 1)), []);
  const decreaseZoom = useCallback(() =>
    setZoomIndex(prev => Math.max(prev - 1, 0)), []);
  const resetZoom = useCallback(() => setZoomIndex(0), []);

  // TTS controls
  const stopTTS = useCallback(() => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    setTtsActive(false);
    setTtsPaused(false);
    utteranceRef.current = null;
  }, [ttsSupported]);

  const pauseTTS = useCallback(() => {
    if (!ttsSupported) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setTtsPaused(true);
      setTtsActive(false);
    }
  }, [ttsSupported]);

  const startTTS = useCallback(() => {
    if (!ttsSupported) return;

    // Resume if paused
    if (ttsPaused && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setTtsPaused(false);
      setTtsActive(true);
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Gather readable text from the main public content
    const main = document.querySelector('main');
    const rawText = main ? main.innerText : document.body.innerText;

    // Clean up text: remove excessive whitespace
    const cleanText = rawText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '. ')
      .trim()
      .slice(0, 5000); // Limit to avoid very long reads

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      setTtsActive(true);
      setTtsPaused(false);
    };
    utterance.onend = () => {
      setTtsActive(false);
      setTtsPaused(false);
      utteranceRef.current = null;
    };
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        setTtsActive(false);
        setTtsPaused(false);
      }
    };
    utterance.onpause = () => {
      setTtsActive(false);
      setTtsPaused(true);
    };
    utterance.onresume = () => {
      setTtsActive(true);
      setTtsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setTtsActive(true);
    setTtsPaused(false);
  }, [ttsSupported, ttsPaused]);

  const resetAll = useCallback(() => {
    setFontSizeIndex(0);
    setZoomIndex(0);
    stopTTS();
  }, [stopTTS]);

  const togglePanel = useCallback(() => setIsPanelOpen(prev => !prev), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  const hasActiveFeatures = fontSizeIndex > 0 || zoomIndex > 0 || ttsActive || ttsPaused;

  return (
    <AccessibilityContext.Provider
      value={{
        fontSizeIndex,
        currentFontSize: FONT_SIZES[fontSizeIndex],
        fontLabel: FONT_LABELS[fontSizeIndex],
        increaseFontSize,
        decreaseFontSize,
        resetFontSize,
        zoomIndex,
        currentZoom: ZOOM_LEVELS[zoomIndex],
        zoomLabel: ZOOM_LABELS[zoomIndex],
        increaseZoom,
        decreaseZoom,
        resetZoom,
        ttsActive,
        ttsPaused,
        ttsSupported,
        startTTS,
        pauseTTS,
        stopTTS,
        isPanelOpen,
        togglePanel,
        closePanel,
        resetAll,
        hasActiveFeatures,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}
