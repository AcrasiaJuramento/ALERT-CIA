const state = {
  muted: false,
  selectedVoice: null,
  lastText: '',
  lastSpokenAt: 0,
};

export function isMuted() {
  return state.muted;
}

export function setMuted(value) {
  state.muted = Boolean(value);
  if (state.muted) stopSpeaking();
}

function getPreferredVoice(lang = 'en-US') {
  if (state.selectedVoice) return state.selectedVoice;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter(voice => voice.lang?.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
  state.selectedVoice = englishVoices.find(voice => /natural|neural|aria|jenny|guy|google|microsoft/i.test(voice.name))
    || englishVoices[0]
    || voices[0]
    || null;
  return state.selectedVoice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    state.selectedVoice = null;
    getPreferredVoice();
  };
}

export function speak(text, { lang = 'en-US', rate = 0.92, pitch = 1.02, interrupt = true } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || state.muted) return;
  if (!text) return;

  const normalizedText = String(text).trim();
  const now = Date.now();
  if (normalizedText === state.lastText && now - state.lastSpokenAt < 8000) return;
  state.lastText = normalizedText;
  state.lastSpokenAt = now;

  if (interrupt) {
    stopSpeaking();
  }

  const utterance = new SpeechSynthesisUtterance(normalizedText);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = 0.95;
  const voice = getPreferredVoice(lang);
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

export default {
  speak,
  stopSpeaking,
  isMuted,
  setMuted,
};
