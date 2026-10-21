// 기초 어휘 플래시카드: 알아요/모르겠어요에 따라 상자(box)를 오르내리며 복습 빈도를 조절한다.
// 시간 개념 없이 상자 번호만 쓴다: 모르겠어요 → 0번 상자, 알아요 → 한 칸 위로. 3번 이상이면 "외운 단어".
import { h, jpText, richText, reading, surface, toast, shuffle } from './ui.js';
import { load, save, remove } from './storage.js';
import { speak } from './speech.js';
import { romajiConverter } from './kana.js';

const STATS_KEY = 'vocabStats';
const PREFS_KEY = 'vocabPrefs';
const MAX_BOX = 5;
const LEARNED_BOX = 3;
const BOX_WEIGHT = [6, 4, 2.5, 1.2, 0.6, 0.3];
const NEW_WEIGHT = 2;
const REQUEUE_GAP = 3; // 모르겠어요 한 카드는 3장 뒤에 한 번 더
const MAX_REQUEUE = 2;

// ---------- 데이터 ----------

let dataPromise;
function loadVocab() {
  dataPromise ??= Promise.all([
    fetch('data/vocab.json').then((r) => {
      if (!r.ok) throw new Error('vocab.json ' + r.status);
      return r.json();
    }),
    romajiConverter(),
  ])
    .then(([raw, toRomaji]) => {
      const catName = Object.fromEntries(raw.categories.map((c) => [c.id, c.name]));
      const words = raw.words.map((w) => ({
        ...w,
        id: w.jp,
        kana: reading(w.jp),
        romaji: w.romaji || toRomaji(reading(w.jp)), // は(wa)처럼 자동 변환이 틀리는 경우만 데이터에 romaji를 적는다
        catName: catName[w.cat] || w.cat,
      }));
      return { categories: raw.categories, words, byId: new Map(words.map((w) => [w.id, w])) };
    })
    .catch((err) => {
      dataPromise = null;
      throw err;
    });
  return dataPromise;
}

// ---------- 기록 ----------

function getStats() {
  return load(STATS_KEY, {});
}

function record(id, known) {
  const stats = getStats();
  const s = stats[id] || { box: 0, k: 0, u: 0 };
  if (known) {
    s.k++;
    s.box = Math.min(MAX_BOX, s.box + 1);
  } else {
    s.u++;
    s.box = 0;
  }
  stats[id] = s;
  save(STATS_KEY, stats);
}

function statusOf(s) {
  if (!s) return 'new';
  return s.box >= LEARNED_BOX ? 'learned' : 'learning';
}

const STATUS_LABEL = { new: '새 단어', learning: '익히는 중', learned: '외움' };

function weightOf(stats, id) {
  const s = stats[id];
  return s ? BOX_WEIGHT[s.box] : NEW_WEIGHT;
}

function getPrefs() {
  return { cat: 'all', count: 10, ...load(PREFS_KEY, {}) };
}

function poolFor(data, cat) {
  return cat === 'all' ? data.words : data.words.filter((w) => w.cat === cat);
}

function counts(words, stats) {
  const c = { new: 0, learning: 0, learned: 0 };
  for (const w of words) c[statusOf(stats[w.id])]++;
  return c;
}

// 모르겠어요를 눌렀고 아직 외우지 못한 단어 (0번 상자)
function unknownWords(words, stats) {
  return words.filter((w) => stats[w.id] && stats[w.id].box === 0);
}

export async function vocabSummary() {
  try {
    const data = await loadVocab();
    const c = counts(data.words, getStats());
    return { total: data.words.length, ...c, started: c.new < data.words.length };
  } catch {
    return null;
  }
}

// 어휘 홈 → 학습 화면으로 넘겨 주는 값: { ids } 이 단어들만, 없으면 저장된 설정대로
let pendingStart = null;

function startStudy(start) {
  pendingStart = start;
  location.hash = '#/vocab/study';
}

// ---------- 어휘 홈 ----------

export async function vocabHome(root) {
  const data = await loadVocab();
  const stats = getStats();
  const prefs = getPrefs();

  const body = h('div', { class: 'stack' });
  let listOpen = false;
  body.addEventListener('toggle', (e) => { if (e.target.matches('.word-details')) listOpen = e.target.open; }, true);

  function renderBody() {
    const pool = poolFor(data, prefs.cat);
    const c = counts(pool, stats);
    const unknown = unknownWords(pool, stats);

    const filter = h('div', { class: 'chips', role: 'tablist' },
      [{ id: 'all', name: '전체' }, ...data.categories].map((cat) =>
        h('button', {
          class: 'chip filter' + (prefs.cat === cat.id ? ' on' : ''),
          role: 'tab',
          'aria-selected': prefs.cat === cat.id ? 'true' : 'false',
          onClick: () => {
            prefs.cat = cat.id;
            save(PREFS_KEY, prefs);
            renderBody();
          },
        }, cat.name, h('span', { class: 'muted' }, ` ${poolFor(data, cat.id).length}`)),
      ),
    );

    const countSeg = h('div', { class: 'seg' },
      [10, 20].map((n) =>
        h('button', {
          class: prefs.count === n ? 'on' : '',
          onClick: () => {
            prefs.count = n;
            save(PREFS_KEY, prefs);
            renderBody();
          },
        }, `${n}장`),
      ),
    );

    body.replaceChildren(
      ...[
      filter,
      h('section', { class: 'card stack' },
        h('div', { class: 'row small' },
          h('span', null, '외운 단어 ', h('b', null, `${c.learned}`), ` / ${pool.length}`),
          h('div', { class: 'spacer' }),
          h('span', { class: 'muted' }, `익히는 중 ${c.learning} · 새 단어 ${c.new}`),
        ),
        h('div', { class: 'progress' }, h('div', { style: `width:${pool.length ? (c.learned / pool.length) * 100 : 0}%` })),
        countSeg,
        h('button', { class: 'btn primary block', onClick: () => startStudy(null) }, '카드 학습 시작'),
        unknown.length
          ? h('button', { class: 'btn block', onClick: () => startStudy({ ids: unknown.map((w) => w.id) }) },
              `모르는 단어만 복습 (${unknown.length})`)
          : null,
      ),
      h('details', { class: 'card word-details', open: listOpen },
        h('summary', null, h('b', null, `단어 목록 (${pool.length})`), h('span', { class: 'small muted' }, ' · 누르면 발음이 나와요')),
        h('ul', { class: 'word-list' },
          pool.map((w) => {
            const st = statusOf(stats[w.id]);
            return h('li', null,
              h('button', { class: 'word-row', onClick: () => speak(w.kana) },
                h('span', { class: 'w-jp' }, jpText(w.jp)),
                h('span', { class: 'w-ko' }, w.ko),
                h('span', { class: `status ${st}` }, STATUS_LABEL[st]),
              ),
            );
          }),
        ),
      ),
      Object.keys(stats).length
        ? h('button', {
            class: 'btn ghost block small',
            onClick: () => {
              if (confirm('어휘 학습 기록을 모두 지울까요? 되돌릴 수 없어요.')) {
                remove(STATS_KEY);
                for (const k of Object.keys(stats)) delete stats[k];
                toast('기록을 지웠어요.');
                renderBody();
              }
            },
          }, '어휘 기록 초기화')
        : null,
      ].filter(Boolean),
    );
  }

  renderBody();
  root.append(
    h('section', { class: 'stack' },
      h('h1', null, '기초 어휘'),
      h('p', { class: 'muted small', style: 'margin-top:-6px' }, '카드를 보고 뜻을 떠올린 뒤 "알아요 / 모르겠어요"를 눌러요. 모르는 단어일수록 자주 나와요.'),
      body,
    ),
  );
}

// ---------- 카드 학습 ----------

export async function vocabStudy(root) {
  const data = await loadVocab();
  let keyHandler = null;
  const onKey = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    keyHandler?.(e);
  };
  document.addEventListener('keydown', onKey);
  const ctx = { data, root, setKeys: (fn) => (keyHandler = fn) };

  const start = pendingStart;
  pendingStart = null;
  if (start?.ids) {
    beginSession(ctx, start.ids.map((id) => data.byId.get(id)).filter(Boolean), start.ids.length);
  } else {
    const prefs = getPrefs();
    beginSession(ctx, poolFor(data, prefs.cat), prefs.count);
  }
  return () => document.removeEventListener('keydown', onKey);
}

function pickCards(pool, count) {
  const stats = getStats();
  const bag = pool.slice();
  const picked = [];
  while (picked.length < count && bag.length) {
    const total = bag.reduce((sum, w) => sum + weightOf(stats, w.id), 0);
    let r = Math.random() * total;
    let idx = bag.length - 1;
    for (let i = 0; i < bag.length; i++) {
      r -= weightOf(stats, bag[i].id);
      if (r <= 0) { idx = i; break; }
    }
    picked.push(bag.splice(idx, 1)[0]);
  }
  return shuffle(picked);
}

function beginSession(ctx, pool, count) {
  if (!pool.length) {
    toast('학습할 단어가 없어요.');
    location.hash = '#/vocab';
    return;
  }
  const session = {
    pool,
    count,
    queue: pickCards(pool, count).map((word) => ({ word, requeued: 0 })),
    done: 0,
    known: new Set(),
    unknown: new Set(),
  };
  renderCard(ctx, session);
}

function renderCard(ctx, session) {
  const { root, setKeys } = ctx;
  const entry = session.queue[0];
  const { word } = entry;
  const total = session.done + session.queue.length;
  let flipped = false;

  const back = h('div', { class: 'fc-back', hidden: true },
    h('div', { class: 'fc-reading' },
      surface(word.jp) !== word.kana ? [jpText(word.kana), ' · '] : null,
      h('span', null, word.romaji),
    ),
    h('div', { class: 'fc-ko' }, word.ko),
    word.note ? h('p', { class: 'fc-note small' }, '💡 ', richText(word.note)) : null,
  );

  const speakBtn = h('button', {
    class: 'icon-btn',
    'aria-label': '발음 듣기',
    onClick: (e) => {
      e.stopPropagation();
      speak(word.kana);
    },
  }, '🔊');

  const card = h('div', { class: 'card flashcard', onClick: () => flip() },
    h('div', { class: 'row small muted' }, h('span', { class: 'badge' }, word.catName), h('div', { class: 'spacer' }), speakBtn),
    h('div', { class: 'fc-front' }, jpText(word.jp, 'fc-jp')),
    back,
  );

  const flipBtn = h('button', { class: 'btn primary block', onClick: () => flip() }, '뜻 보기');
  const answerBtns = h('div', { class: 'answer-btns', hidden: true },
    h('button', { class: 'btn unknown', onClick: () => answer(false) }, '모르겠어요'),
    h('button', { class: 'btn known', onClick: () => answer(true) }, '알아요'),
  );

  const hint = h('p', { class: 'small muted center', style: 'margin:0' }, '뜻을 먼저 떠올려 본 뒤 카드를 눌러요.');

  function flip() {
    if (flipped) return;
    flipped = true;
    hint.hidden = true;
    back.hidden = false;
    flipBtn.hidden = true;
    answerBtns.hidden = false;
    card.classList.add('flipped');
    speak(word.kana);
  }

  function answer(known) {
    if (!flipped || session.queue[0] !== entry) return;
    record(word.id, known);
    session.queue.shift();
    session.done++;
    if (known) {
      session.known.add(word.id);
    } else {
      session.unknown.add(word.id);
      if (entry.requeued < MAX_REQUEUE) {
        session.queue.splice(Math.min(REQUEUE_GAP, session.queue.length), 0, { word, requeued: entry.requeued + 1 });
      }
    }
    if (session.queue.length) renderCard(ctx, session);
    else renderResult(ctx, session);
  }

  setKeys((e) => {
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      flip();
    } else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      answer(false);
    } else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) {
      e.preventDefault();
      answer(true);
    }
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('span', { class: 'small muted' }, `${session.done + 1} / ${total}`),
        h('div', { class: 'spacer' }),
        h('button', {
          class: 'btn ghost small',
          onClick: () => {
            if (session.done === 0 || confirm('학습을 그만할까요? 지금까지 기록은 저장돼요.')) location.hash = '#/vocab';
          },
        }, '그만하기'),
      ),
      h('div', { class: 'progress' }, h('div', { style: `width:${(session.done / total) * 100}%` })),
      card,
      flipBtn,
      answerBtns,
      hint,
    ),
  );
}

function renderResult(ctx, session) {
  const { root, setKeys, data } = ctx;
  const stats = getStats();
  // 한 번이라도 모르겠어요를 누른 단어는 "모르는 단어"로 본다
  const unknown = [...session.unknown].map((id) => data.byId.get(id));
  const knownOnly = [...session.known].filter((id) => !session.unknown.has(id)).length;
  const c = counts(data.words, stats);

  setKeys(null);
  root.replaceChildren(
    h('div', { class: 'stack' },
      h('div', { class: 'card stack center' },
        h('div', { class: 'muted' }, '학습 완료'),
        h('div', { class: 'result-score' }, `${knownOnly} / ${knownOnly + unknown.length}`),
        h('div', null, '바로 알아본 단어'),
        h('div', { class: 'progress' }, h('div', { style: `width:${(c.learned / data.words.length) * 100}%` })),
        h('div', { class: 'small muted' }, `전체 외운 단어 ${c.learned} / ${data.words.length}`),
      ),
      unknown.length
        ? h('div', { class: 'card stack' },
            h('h2', { style: 'margin:0' }, '헷갈렸던 단어'),
            h('ul', { class: 'word-list' },
              unknown.map((w) =>
                h('li', null,
                  h('button', { class: 'word-row', onClick: () => speak(w.kana) },
                    h('span', { class: 'w-jp' }, jpText(w.jp)),
                    h('span', { class: 'w-ko' }, w.ko),
                  ),
                ),
              ),
            ),
            h('button', {
              class: 'btn primary block',
              onClick: () => beginSession(ctx, unknown, unknown.length),
            }, '헷갈렸던 단어만 다시'),
          )
        : null,
      h('button', {
        class: 'btn block' + (unknown.length ? '' : ' primary'),
        onClick: () => beginSession(ctx, session.pool, session.count),
      }, '새 카드로 계속하기'),
      h('a', { class: 'btn ghost block', href: '#/vocab' }, '어휘 홈'),
    ),
  );
}
