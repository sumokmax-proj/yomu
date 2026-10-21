// 공용 DOM/유틸 함수

// h('div', { class: 'card', onClick: fn }, '내용', childNode)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// 일본어 텍스트는 lang="ja"를 달아서 일본어 자형으로 렌더링되게 한다.
export function jp(text, cls = '') {
  return h('span', { class: ('jp ' + cls).trim(), lang: 'ja' }, text);
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- 일본어 표기 ----------
// 데이터에서는 한자에 {漢字|かな} 형식으로 후리가나를 붙인다. 예: "{今日|きょう}はいい{日|ひ}"
const RUBY_RE = /\{([^|}]+)\|([^}]+)\}/g;
const JP_RUN_RE = /((?:\{[^|}]+\|[^}]+\}|[぀-ヿ㐀-鿿々～〜])+)/;

// 후리가나를 모두 읽기(가나)로 바꾼 문자열. 음성 재생·로마자 변환용
export function reading(text) {
  return text.replace(RUBY_RE, '$2');
}

// 후리가나를 뺀 표기 문자열
export function surface(text) {
  return text.replace(RUBY_RE, '$1');
}

// 일본어 문자열 → <span lang="ja"> 안에 한자는 <ruby>로 후리가나 표시
export function jpText(text, cls = '') {
  const el = h('span', { class: ('jp ' + cls).trim(), lang: 'ja' });
  let last = 0;
  for (const m of text.matchAll(RUBY_RE)) {
    if (m.index > last) el.append(text.slice(last, m.index));
    el.append(h('ruby', null, m[1], h('rp', null, '('), h('rt', null, m[2]), h('rp', null, ')')));
    last = m.index + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
  return el;
}

// 한국어 설명 속 일본어 부분만 일본어 폰트·후리가나로 표시
export function richText(text) {
  const parts = text.split(JP_RUN_RE);
  return parts.map((part, i) => (i % 2 === 1 ? jpText(part) : part));
}
