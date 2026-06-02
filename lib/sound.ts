let audioContext: AudioContext | null = null;

/**
 * Play a pleasant chime sound using the Web Audio API.
 * This replaces react-native-sound from the mobile app.
 */
export function playPaidSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const now = audioContext.currentTime;

    // Create two-tone chime: C6 (1047 Hz) then E6 (1319 Hz)
    const oscillator1 = audioContext.createOscillator();
    oscillator1.type = "sine";
    oscillator1.frequency.setValueAtTime(1047, now);

    const gain1 = audioContext.createGain();
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    oscillator1.connect(gain1);
    gain1.connect(audioContext.destination);
    oscillator1.start(now);
    oscillator1.stop(now + 0.4);

    const oscillator2 = audioContext.createOscillator();
    oscillator2.type = "sine";
    oscillator2.frequency.setValueAtTime(1319, now + 0.15);

    const gain2 = audioContext.createGain();
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    oscillator2.connect(gain2);
    gain2.connect(audioContext.destination);
    oscillator2.start(now + 0.15);
    oscillator2.stop(now + 0.6);
  } catch {
    // Audio not available, silently skip
  }
}
