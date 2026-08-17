export async function playAccidentAreaAlarm() {
  if (typeof window === 'undefined') return false;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;

  let context;
  try {
    context = new AudioContext();
    if (context.state === 'suspended') {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise(resolve => window.setTimeout(resolve, 300)),
      ]);
    }
    if (context.state !== 'running') {
      await context.close().catch(() => undefined);
      return false;
    }

    const startAt = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.connect(context.destination);

    [0, 0.34, 0.68].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const toneStart = startAt + offset;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 660, toneStart);
      oscillator.connect(gain);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.12, toneStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.24);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + 0.25);
    });

    window.setTimeout(() => context?.close().catch(() => undefined), 1100);
    return true;
  } catch {
    await context?.close().catch(() => undefined);
    return false;
  }
}
