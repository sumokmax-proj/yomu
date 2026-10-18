// 브라우저 내장 음성(Web Speech API)으로 일본어를 읽어 준다.
import { toast } from './ui.js';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice = null;
let warned = false;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'ja-JP' && /google|kyoko|o-ren|siri/i.test(v.name)) ||
    voices.find((v) => v.lang === 'ja-JP') ||
    voices.find((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('ja')) ||
    null;
}

if (supported) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function speak(text, { rate = 0.85 } = {}) {
  if (!supported) {
    toast('이 브라우저는 음성 재생을 지원하지 않아요.');
    return;
  }
  if (!voice) pickVoice();
  if (!voice && !warned) {
    warned = true;
    toast('일본어 음성이 없어서 다른 목소리로 읽을 수 있어요. 기기 설정에서 일본어 음성을 추가해 보세요.');
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
}
