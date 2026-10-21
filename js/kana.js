// 히라가나·가타카나 복습: 오십음도, 퀴즈, 약한 글자 통계
import { h, jp, toast, shuffle, pickRandom } from './ui.js';
import { load, save, remove } from './storage.js';
import { speak } from './speech.js';

const STATS_KEY = 'kanaStats';
const SETTINGS_KEY = 'kanaQuizSettings';
const CHART_KEY = 'kanaChartPrefs';

const DEFAULT_SETTINGS = {
  script: 'hira', // hira | kata | both
  sections: ['basic'],
  mode: 'k2r', // k2r: 문자→발음, r2k: 발음→문자, mix
  count: 10,
  autoSpeak: true,
};

// ---------- 데이터 ----------

let dataPromise;
function loadKana() {
  dataPromise ??= fetch('data/kana.json')
    .then((r) => {
      if (!r.ok) throw new Error('kana.json ' + r.status);
      return r.json();
    })
    .then(prepare)
    .catch((err) => {
      dataPromise = null;
      throw err;
    });
  return dataPromise;
}

function prepare(raw) {
  const items = new Map(); // 글자 → 항목
  for (const section of raw.sections) {
    for (const row of section.rows) {
      for (const cell of row) {
        if (!cell) continue;
        for (const script of ['hira', 'kata']) {
          const char = cell[script];
          items.set(char, {
            char,
            script,
            pair: cell[script === 'hira' ? 'kata' : 'hira'],
            romaji: cell.romaji,
            ko: cell.ko,
            section: section.id,
          });
        }
      }
    }
  }
  // 헷갈리는 글자 그룹: 글자 → [{ chars, tip }]
  const confusable = new Map();
  for (const group of raw.confusables || []) {
    for (const c of group.chars) {
      if (!confusable.has(c)) confusable.set(c, []);
      confusable.get(c).push(group);
    }
  }
  return { sections: raw.sections, items, all: [...items.values()], confusable };
}

// 가나 → 로마자 (예: ありがとう → arigatō, ゲーム → gēmu, ちょっと → chotto)
export async function romajiConverter() {
  const data = await loadKana();
  const small = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o' };
  const macron = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
  const rm = (char) => data.items.get(char)?.romaji.replace(/\(.*\)/, '');
  return (text) => {
    let out = '';
    let geminate = false;
    for (let i = 0; i < text.length; i++) {
      const two = rm(text.slice(i, i + 2));
      let syl = two || rm(text[i]);
      if (two) i++;
      const ch = text[i];
      if (!syl) {
        if (ch === 'っ' || ch === 'ッ') { geminate = true; continue; }
        if (ch === 'ー' && /[aiueo]$/.test(out)) { out = out.slice(0, -1) + macron[out.slice(-1)]; continue; }
        if (small[ch] && /[aiueo]$/.test(out)) { out = out.slice(0, -1) + small[ch]; continue; }
        syl = ch === 'ヴ' ? 'vu' : ch;
      }
      if (geminate) {
        syl = (syl.startsWith('ch') ? 't' : syl[0]) + syl;
        geminate = false;
      }
      out += syl;
    }
    return out;
  };
}

function confusablesOf(data, char) {
  const out = new Set();
  for (const g of data.confusable.get(char) || []) for (const c of g.chars) if (c !== char) out.add(c);
  return [...out].map((c) => data.items.get(c)).filter(Boolean);
}

function tipFor(data, a, b) {
  const groups = data.confusable.get(a) || [];
  return (groups.find((g) => g.chars.includes(b)) || groups[0])?.tip || null;
}

// ---------- 기록 ----------

function getStats() {
  return load(STATS_KEY, {});
}

function record(char, correct) {
  const stats = getStats();
  const s = stats[char] || { c: 0, w: 0 };
  if (correct) s.c++;
  else s.w++;
  s.last = correct ? 1 : 0;
  s.t = Date.now();
  stats[char] = s;
  save(STATS_KEY, stats);
}

// 틀린 횟수 1번은 맞힌 횟수 2번으로 상쇄된다. 0보다 크면 아직 헷갈리는 글자.
function confusion(s) {
  return s ? s.w * 2 - s.c : 0;
}

function isWeak(s) {
  return !!s && (s.last === 0 || confusion(s) > 0);
}

// 익힌 글자: 2번 이상 맞혔고, 마지막에도 맞혔고, 헷갈리는 상태가 아님
function isMastered(s) {
  return !!s && s.c >= 2 && s.last === 1 && !isWeak(s);
}

// 출제 가중치: 헷갈리는 글자일수록, 방금 틀린 글자일수록 자주 나오고, 익힌 글자는 가끔만 나온다.
function weightOf(stats, char) {
  const s = stats[char];
  if (!s) return 1.5; // 아직 안 풀어 본 글자
  if (isMastered(s)) return 0.3;
  let w = 1 + 1.5 * Math.max(0, confusion(s));
  if (s.last === 0) w *= 2;
  return Math.min(10, w);
}

function weightedPick(list, weight) {
  const total = list.reduce((sum, x) => sum + weight(x), 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= weight(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) };
}

function buildPool(data, settings) {
  return data.all.filter(
    (it) => settings.sections.includes(it.section) && (settings.script === 'both' || it.script === settings.script),
  );
}

function progressOf(items, stats) {
  return {
    total: items.length,
    mastered: items.filter((it) => isMastered(stats[it.char])).length,
    weak: items.filter((it) => isWeak(stats[it.char])).length,
  };
}

// 홈 화면용: 기본 글자 기준 히라가나·가타카나 진도
export async function kanaSummary() {
  let data;
  try {
    data = await loadKana();
  } catch {
    return null;
  }
  const stats = getStats();
  const basic = (script) => data.all.filter((it) => it.section === 'basic' && it.script === script);
  return {
    started: data.all.some((it) => stats[it.char]),
    hira: progressOf(basic('hira'), stats),
    kata: progressOf(basic('kata'), stats),
    weak: data.all.filter((it) => isWeak(stats[it.char])).length,
  };
}

function weakItems(data) {
  const stats = getStats();
  return data.all
    .filter((it) => isWeak(stats[it.char]))
    .sort((a, b) => weightOf(stats, b.char) - weightOf(stats, a.char));
}

// 가나 홈에서 바로 시작할 때 퀴즈 화면으로 넘겨 주는 값
// { script } → 저장된 설정에서 문자만 바꿔 시작, { chars } → 그 글자들만 출제
let pendingStart = null;

function startFromHome(start) {
  pendingStart = start;
  location.hash = '#/kana/quiz';
}

function progressBar(p) {
  const pct = p.total ? (p.mastered / p.total) * 100 : 0;
  return h('div', { class: 'progress', title: `익힌 글자 ${p.mastered} / ${p.total}` }, h('div', { style: `width:${pct}%` }));
}

// ---------- 가나 홈 ----------

export async function kanaHome(root) {
  const data = await loadKana();
  const stats = getStats();
  const settings = getSettings();
  const weak = weakItems(data);
  const rangeName = data.sections.filter((s) => settings.sections.includes(s.id)).map((s) => s.name.split(' ')[0]).join('·');

  const scriptCard = (script, title, sample) => {
    const p = progressOf(buildPool(data, { ...settings, script }), stats);
    return h('section', { class: 'card stack' },
      h('div', { class: 'row' },
        h('div', { class: 'big-glyph' }, jp(sample)),
        h('div', { style: 'flex:1;min-width:0' },
          h('h2', { style: 'margin:0' }, jp(title)),
          h('div', { class: 'small muted' }, `익힌 글자 `, h('b', null, `${p.mastered}`), ` / ${p.total}`, p.weak ? ` · 헷갈림 ${p.weak}` : ''),
        ),
      ),
      progressBar(p),
      h('button', { class: 'btn primary block', onClick: () => startFromHome({ script }) }, '퀴즈 시작'),
    );
  };

  root.append(
    h('section', { class: 'stack' },
      h('h1', null, '히라가나·가타카나'),
      h('p', { class: 'muted small', style: 'margin-top:-6px' },
        `범위: ${rangeName} · `, h('a', { href: '#/kana/quiz' }, '설정 바꾸기')),
      scriptCard('hira', 'ひらがな', 'あ'),
      scriptCard('kata', 'カタカナ', 'ア'),
      weak.length
        ? h('section', { class: 'card stack' },
            h('div', { class: 'row' },
              h('h2', { style: 'margin:0' }, `헷갈리는 글자 ${weak.length}개`),
            ),
            h('div', { class: 'chips' },
              weak.slice(0, 30).map((it) =>
                h('button', { class: 'chip bad', onClick: () => speak(it.char) }, jp(it.char), it.romaji),
              ),
            ),
            h('button', { class: 'btn block', onClick: () => startFromHome({ chars: weak.map((it) => it.char) }) }, '헷갈리는 글자만 연습'),
          )
        : null,
      h('a', { class: 'card menu-card', href: '#/kana/chart' },
        h('div', { class: 'big-glyph' }, jp('表')),
        h('div', null, h('h2', null, '오십음도 보기'), h('p', { class: 'muted small' }, '글자를 누르면 발음이 나와요 · 익힌 글자는 초록색')),
      ),
      Object.keys(stats).length
        ? h('button', {
            class: 'btn ghost block small',
            onClick: () => {
              if (confirm('가나 퀴즈 기록을 모두 지울까요? 되돌릴 수 없어요.')) {
                remove(STATS_KEY);
                toast('기록을 지웠어요.');
                root.replaceChildren();
                kanaHome(root);
              }
            },
          }, '가나 기록 초기화')
        : null,
    ),
  );
}

// ---------- 오십음도 ----------

export async function kanaChart(root) {
  const data = await loadKana();
  const prefs = { script: 'hira', showReading: true, ...load(CHART_KEY, {}) };
  const stats = getStats();
  let selected = null;

  const detail = h('div', { class: 'card kana-detail' });
  const grids = h('div');

  function renderDetail() {
    if (!selected) {
      detail.replaceChildren(
        h('div', { class: 'info muted small' }, '글자를 누르면 발음이 나와요. 초록 칸은 익힌 글자, 빨간 점은 헷갈리는 글자예요.'),
      );
      return;
    }
    const it = data.items.get(selected);
    const s = stats[it.char];
    const conf = confusablesOf(data, it.char).filter((c) => c.script === it.script);
    detail.replaceChildren(
      jp(it.char, 'glyph'),
      h('div', { class: 'info' },
        h('div', { class: 'reading' }, it.romaji, ' ', h('span', { class: 'muted' }, `[${it.ko}]`)),
        h('div', { class: 'small muted' },
          it.script === 'hira' ? '가타카나 ' : '히라가나 ', jp(it.pair),
          s ? ` · 맞음 ${s.c} / 틀림 ${s.w}` : '',
        ),
        conf.length ? h('div', { class: 'small muted' }, '헷갈리기 쉬운 글자: ', jp(conf.map((c) => c.char).join(' '))) : null,
      ),
      h('button', { class: 'icon-btn', 'aria-label': '발음 듣기', onClick: () => speak(it.char) }, '🔊'),
    );
  }

  function renderGrids() {
    grids.className = prefs.showReading ? '' : 'hide-reading';
    grids.replaceChildren(
      ...data.sections.map((section) =>
        h('section', { class: 'kana-section' },
          h('h2', null, section.name),
          h('div', {
            class: `kana-grid cols-${section.cols}`,
            style: `grid-template-columns: repeat(${section.cols}, 1fr)`,
          },
            section.rows.flatMap((row) =>
              row.map((cell) => {
                if (!cell) return h('div', { class: 'kana-cell empty', 'aria-hidden': 'true' });
                const char = cell[prefs.script];
                const cls = ['kana-cell'];
                if (isWeak(stats[char])) cls.push('weak');
                else if (isMastered(stats[char])) cls.push('mastered');
                if (selected === char) cls.push('selected');
                return h('button', {
                  class: cls.join(' '),
                  'aria-label': `${char} ${cell.romaji}`,
                  onClick: (e) => {
                    selected = char;
                    speak(char);
                    renderDetail();
                    grids.querySelectorAll('.kana-cell.selected').forEach((el) => el.classList.remove('selected'));
                    e.currentTarget.classList.add('selected');
                  },
                },
                  jp(char, 'ch'),
                  h('span', { class: 'rm' }, cell.romaji),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  const scriptSeg = h('div', { class: 'seg', role: 'tablist' });
  function renderSeg() {
    scriptSeg.replaceChildren(
      ...[['hira', 'ひらがな'], ['kata', 'カタカナ']].map(([key, label]) =>
        h('button', {
          class: prefs.script === key ? 'on' : '',
          role: 'tab',
          'aria-selected': prefs.script === key ? 'true' : 'false',
          onClick: () => {
            prefs.script = key;
            save(CHART_KEY, prefs);
            // 같은 칸의 다른 문자로 선택 이동
            if (selected) selected = data.items.get(selected)?.pair || null;
            renderSeg();
            renderGrids();
            renderDetail();
          },
        }, jp(label)),
      ),
    );
  }

  const readingToggle = h('label', { class: 'check' },
    h('input', {
      type: 'checkbox',
      checked: prefs.showReading,
      onChange: (e) => {
        prefs.showReading = e.target.checked;
        save(CHART_KEY, prefs);
        renderGrids();
      },
    }),
    '발음 표시',
  );

  renderSeg();
  renderDetail();
  renderGrids();

  root.append(
    h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('a', { href: '#/kana', class: 'muted small' }, '← 가나 복습'), h('div', { class: 'spacer' }), readingToggle),
      scriptSeg,
      detail,
      grids,
      h('a', { class: 'btn primary block', href: '#/kana/quiz', style: 'margin-top:20px' }, '퀴즈로 확인하기'),
    ),
  );
}

// ---------- 퀴즈 ----------

export async function kanaQuiz(root) {
  const data = await loadKana();
  let keyHandler = null;
  const setKeys = (fn) => { keyHandler = fn; };
  const onKey = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof HTMLInputElement) return;
    keyHandler?.(e);
  };
  document.addEventListener('keydown', onKey);

  const ctx = { data, root, setKeys };
  const start = pendingStart;
  pendingStart = null;
  if (start?.chars) {
    const pool = start.chars.map((c) => data.items.get(c)).filter(Boolean);
    startQuiz(ctx, pool, { ...getSettings(), count: reviewCount(pool) });
  } else if (start?.script) {
    const settings = { ...getSettings(), script: start.script };
    startQuiz(ctx, buildPool(data, settings), settings);
  } else {
    renderSettings(ctx);
  }

  return () => document.removeEventListener('keydown', onKey);
}

function reviewCount(pool) {
  return Math.max(5, Math.min(15, pool.length * 2));
}

function renderSettings(ctx) {
  const { data, root, setKeys } = ctx;
  const settings = getSettings();
  setKeys(null);

  const radioSeg = (name, options) =>
    h('div', { class: 'seg' },
      options.map(([value, label]) =>
        h('label', null,
          h('input', { type: 'radio', name, value, checked: String(settings[name]) === String(value) }),
          label,
        ),
      ),
    );

  const form = h('form', { class: 'card stack' },
    h('div', { class: 'field' }, h('span', { class: 'label' }, '문자'),
      radioSeg('script', [['hira', '히라가나'], ['kata', '가타카나'], ['both', '섞어서']])),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '범위'),
      h('div', { class: 'checks' },
        data.sections.map((s) =>
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', name: 'sections', value: s.id, checked: settings.sections.includes(s.id) }),
            s.name,
          ),
        ),
      )),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '문제 방식'),
      radioSeg('mode', [['k2r', '문자→발음'], ['r2k', '발음→문자'], ['mix', '섞어서']])),
    h('div', { class: 'field' }, h('span', { class: 'label' }, '문제 수'),
      radioSeg('count', [[10, '10'], [20, '20'], [30, '30']])),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', name: 'autoSpeak', checked: settings.autoSpeak }),
      '정답 확인 후 발음 자동 재생',
    ),
    h('p', { class: 'small muted', style: 'margin:0' }, '헷갈리는 글자는 더 자주, 익힌 글자는 가끔 나와요.'),
    h('button', { class: 'btn primary block', type: 'submit' }, '시작하기'),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const next = {
      script: fd.get('script'),
      sections: fd.getAll('sections'),
      mode: fd.get('mode'),
      count: Number(fd.get('count')),
      autoSpeak: fd.get('autoSpeak') === 'on',
    };
    if (!next.sections.length) {
      toast('범위를 하나 이상 골라 주세요.');
      return;
    }
    save(SETTINGS_KEY, next);
    startQuiz(ctx, buildPool(data, next), next);
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      h('a', { href: '#/kana', class: 'muted small' }, '← 가나 복습'),
      h('h1', null, '퀴즈 설정'),
      form,
    ),
  );
}

function makeQuestions(ctx, pool, settings) {
  const stats = getStats();
  const questions = [];
  let bag = pool.slice();
  let prev = null;
  while (questions.length < settings.count) {
    if (!bag.length) bag = pool.slice();
    let cand = bag.filter((it) => it.char !== prev);
    if (!cand.length) cand = bag;
    const item = weightedPick(cand, (it) => weightOf(stats, it.char));
    bag.splice(bag.indexOf(item), 1);
    prev = item.char;
    const mode = settings.mode === 'mix' ? pickRandom(['k2r', 'r2k']) : settings.mode;
    questions.push({ item, mode, options: makeOptions(ctx.data, item, pool) });
  }
  return questions;
}

// 보기 4개: 정답 + 헷갈리는 글자(최대 2개) + 나머지 무작위. 발음이 겹치는 보기는 넣지 않는다.
function makeOptions(data, item, pool) {
  const chosen = [item];
  const ok = (c) => c.script === item.script && !chosen.some((x) => x.romaji === c.romaji || x.ko === c.ko);
  for (const c of shuffle(confusablesOf(data, item.char))) {
    if (chosen.length >= 3) break;
    if (ok(c)) chosen.push(c);
  }
  const sameSection = shuffle(pool.filter((c) => c.section === item.section));
  const rest = shuffle(data.all.filter((c) => c.section === item.section));
  for (const c of [...sameSection, ...rest, ...shuffle(data.all)]) {
    if (chosen.length >= 4) break;
    if (ok(c)) chosen.push(c);
  }
  return shuffle(chosen);
}

function startQuiz(ctx, pool, settings) {
  if (!pool.length) {
    toast('출제할 글자가 없어요.');
    renderSettings(ctx);
    return;
  }
  const questions = makeQuestions(ctx, pool, settings);
  const session = { questions, index: 0, results: [], settings, pool };
  renderQuestion(ctx, session);
}

function renderQuestion(ctx, session) {
  const { root, setKeys, data } = ctx;
  const q = session.questions[session.index];
  const { item, mode } = q;
  const total = session.questions.length;
  let answered = false;

  const speakBtn = h('button', { class: 'icon-btn', 'aria-label': '발음 듣기', onClick: () => speak(item.char) }, '🔊');

  const prompt =
    mode === 'k2r'
      ? h('div', { class: 'card prompt' },
          jp(item.char, 'q-glyph'),
          h('div', { class: 'q-sub' }, '이 글자의 발음은?'),
        )
      : h('div', { class: 'card prompt' },
          h('div', { class: 'q-reading' }, item.romaji),
          h('div', { class: 'q-sub' }, `[${item.ko}] · ${item.script === 'hira' ? '히라가나' : '가타카나'}로 고르세요`),
          h('div', { style: 'margin-top:10px' }, speakBtn),
        );

  const optionButtons = q.options.map((opt, i) =>
    h('button', { class: 'option', onClick: () => choose(opt) },
      h('span', { class: 'key' }, String(i + 1)),
      mode === 'k2r'
        ? [h('span', { class: 'o-main' }, opt.romaji), h('span', { class: 'o-sub' }, opt.ko)]
        : jp(opt.char, 'o-main'),
    ),
  );

  const feedbackSlot = h('div');
  const nextBtn = h('button', { class: 'btn primary block', onClick: next, hidden: true },
    session.index + 1 < total ? '다음 문제' : '결과 보기');

  function choose(opt) {
    if (answered) return;
    answered = true;
    const correct = opt === item;
    record(item.char, correct);
    session.results.push({ item, correct, picked: opt });

    optionButtons.forEach((b, i) => {
      b.disabled = true;
      const o = q.options[i];
      if (o === item) b.classList.add('correct');
      else if (o === opt) b.classList.add('wrong');
    });

    const answerLine = h('div', null, jp(item.char), ` = ${item.romaji} [${item.ko}]  `, h('span', { class: 'muted small' }, '(', jp(item.pair), ')'));
    if (correct) {
      feedbackSlot.replaceChildren(
        h('div', { class: 'feedback ok' }, h('div', { class: 'title' }, '정답!'), answerLine),
      );
    } else {
      const tip = tipFor(data, item.char, opt.char);
      const isConfusable = confusablesOf(data, item.char).includes(opt);
      feedbackSlot.replaceChildren(
        h('div', { class: 'feedback bad' },
          h('div', { class: 'title' }, '아쉬워요! 정답은'),
          answerLine,
          h('div', { class: 'compare' },
            [item, opt].map((x, i) =>
              h('button', { class: 'pair', onClick: () => speak(x.char), 'aria-label': `${x.char} 발음 듣기` },
                jp(x.char),
                h('span', { class: 'small' }, x.romaji),
                h('div', { class: 'small muted' }, i === 0 ? '정답' : '고른 답'),
              ),
            ),
          ),
          isConfusable && tip ? h('p', { class: 'small', style: 'margin:10px 0 0' }, '💡 ', tip) : null,
        ),
      );
    }
    if (mode === 'k2r' && !prompt.contains(speakBtn)) prompt.append(h('div', { style: 'margin-top:10px' }, speakBtn));
    if (session.settings.autoSpeak) speak(item.char);
    nextBtn.hidden = false;
    nextBtn.focus({ preventScroll: true });
    nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function next() {
    // 연타로 두 번 넘어가지 않게 지금 화면의 문제일 때만 넘긴다
    if (session.questions[session.index] !== q) return;
    session.index++;
    if (session.index < total) renderQuestion(ctx, session);
    else renderResult(ctx, session);
  }

  setKeys((e) => {
    if (!answered && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      choose(q.options[Number(e.key) - 1]);
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('span', { class: 'small muted' }, `${session.index + 1} / ${total}`),
        h('div', { class: 'spacer' }),
        h('button', {
          class: 'btn ghost small',
          onClick: () => {
            if (session.results.length === 0 || confirm('퀴즈를 그만할까요? 지금까지 푼 기록은 저장돼요.')) location.hash = '#/kana';
          },
        }, '그만하기'),
      ),
      h('div', { class: 'progress' }, h('div', { style: `width:${(session.index / total) * 100}%` })),
      prompt,
      h('div', { class: 'options' }, optionButtons),
      feedbackSlot,
      nextBtn,
    ),
  );
}

function renderResult(ctx, session) {
  const { root, setKeys } = ctx;
  const correct = session.results.filter((r) => r.correct).length;
  const total = session.results.length;
  const wrongItems = [...new Map(session.results.filter((r) => !r.correct).map((r) => [r.item.char, r.item])).values()];
  const pct = Math.round((correct / total) * 100);
  const mastery = progressOf(session.pool, getStats());
  const message = pct === 100 ? '완벽해요! 🎉' : pct >= 80 ? '잘했어요!' : pct >= 50 ? '조금만 더!' : '천천히 다시 해 봐요.';

  setKeys((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startQuiz(ctx, session.pool, session.settings);
    }
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      h('div', { class: 'card stack center' },
        h('div', { class: 'muted' }, '결과'),
        h('div', { class: 'result-score' }, `${correct} / ${total}`),
        h('div', null, message),
        progressBar(mastery),
        h('div', { class: 'small muted' }, `이 범위에서 익힌 글자 ${mastery.mastered} / ${mastery.total}`),
      ),
      wrongItems.length
        ? h('div', { class: 'card stack' },
            h('h2', { style: 'margin:0' }, '틀린 글자'),
            h('div', { class: 'chips' },
              wrongItems.map((it) =>
                h('button', { class: 'chip bad', onClick: () => speak(it.char) }, jp(it.char), it.romaji),
              ),
            ),
            h('button', {
              class: 'btn primary block',
              onClick: () => startQuiz(ctx, wrongItems, { ...session.settings, count: reviewCount(wrongItems) }),
            }, '틀린 글자만 다시 풀기'),
          )
        : null,
      h('button', { class: 'btn block' + (wrongItems.length ? '' : ' primary'), onClick: () => startQuiz(ctx, session.pool, session.settings) }, '같은 설정으로 다시 하기'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', style: 'flex:1', onClick: () => renderSettings(ctx) }, '설정 바꾸기'),
        h('a', { class: 'btn ghost', style: 'flex:1', href: '#/kana' }, '가나 홈'),
      ),
    ),
  );
}
