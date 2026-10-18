// localStorage 래퍼. 모든 키는 "yomu." 접두사를 붙여 저장한다.
// 사생활 보호 모드 등에서 localStorage 접근이 막혀도 앱이 죽지 않게 try/catch로 감싼다.
const PREFIX = 'yomu.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 (용량 초과·차단) */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
