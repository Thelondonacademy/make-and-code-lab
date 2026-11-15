// Legge ad alta voce i testi (per i bambini che non leggono ancora bene). Voce italiana del browser.
let voice: SpeechSynthesisVoice | null = null;
function pick() {
  if (typeof speechSynthesis === 'undefined') return;
  const vs = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('it'));
  voice = vs.find(v => /google|natural|neural/i.test(v.name)) || vs[0] || null;
}
if (typeof speechSynthesis !== 'undefined') { pick(); speechSynthesis.onvoiceschanged = pick; }

export const canSpeak = () => typeof speechSynthesis !== 'undefined';

export function speak(text: string) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/→/g, ' va al ').replace(/\bGND\b/g, 'gi enne di').replace(/\b3V\b/g, 'tre volt'));
  u.lang = 'it-IT';
  if (voice) u.voice = voice;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); }
