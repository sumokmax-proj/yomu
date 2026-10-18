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

function isWeak(s) {
  return !!s && s.w > 0 && (s.last === 0 || s.w * 2 >= s.c);
}

// 출제 가중치: 많이 틀린 글자일수록, 최근에 틀린 글자일수록 자주 나온다.
function weightOf(stats, char) {
  const s = stats[char];
  if (!s) return 1.5; // 아직 안 풀어 본 글자
  let w = (1 + 2.5 * s.w) / (1 + 0.4 * s.c);
  if (s.last === 0) w *= 2;
  return Math.min(10, Math.max(0.25, w));
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

export async function kanaSummary() {
  let data;
  try {
    data = await loadKana();
  } catch {
    return { seen: 0, total: 0, accuracy: 0, weak: 0 };
  }
  const stats = getStats();
  let c = 0, w = 0, seen = 0, weak = 0;
  for (const [char, s] of Object.entries(stats)) {
    if (!data.items.has(char)) continue;
    seen++;
    c += s.c;
    w += s.w;
    if (isWeak(s)) weak++;
  }
  return { seen, total: data.items.size, accuracy: c + w ? Math.round((c / (c + w)) * 100) : 0, weak };
}

function weakItems(data) {
  const stats = getStats();
  return data.all
    .filter((it) => isWeak(stats[it.char]))
    .sort((a, b) => weightOf(stats, b.char) - weightOf(stats, a.char));
}

// 약한 글자 집중 / 틀린 글자 다시 풀기를 위한 출제 풀 (퀴즈 화면으로 넘겨 줌)
let pendingPool = null;

// ---------- 가나 홈 ----------

export async function kanaHome(root) {
  const data = await loadKana();
  const stats = getStats();
  const weak = weakItems(data);

  const weakSection = weak.length
    ? h('section', { class: 'card stack' },
        h('div', { class: 'row' },
          h('h2', { style: 'margin:0' }, '헷갈리는 글자'),
          h('div', { class: 'spacer' }),
          h('button', {
            class: 'btn small primary',
            onClick: () => {
              pendingPool = weak.map((it) => it.char);
              location.hash = '#/kana/quiz';
            },
          }, '집중 연습'),
        ),
        h('ul', { class: 'weak-list' },
          weak.slice(0, 24).map((it) =>
            h('li', null,
              jp(it.char),
              h('div', { class: 'small' }, it.romaji),
              h('div', { class: 'small muted' }, `틀림 ${stats[it.char].w} · 맞음 ${stats[it.char].c}`),
            ),
          ),
        ),
      )
    : h('section', { class: 'card' },
        h('h2', null, '헷갈리는 글자'),
        h('p', { class: 'muted small', style: 'margin:0' }, '퀴즈에서 틀린 글자가 여기에 모여요. 틀린 글자는 다음 퀴즈에 더 자주 나와요.'),
      );

  root.append(
    h('section', { class: 'stack' },
      h('h1', null, '히라가나·가타카나 복습'),
      h('a', { class: 'card menu-card', href: '#/kana/chart' },
        h('div', { class: 'big-glyph' }, jp('表')),
        h('div', null, h('h2', null, '오십음도 보기'), h('p', { class: 'muted small' }, '글자를 누르면 발음을 들을 수 있어요')),
      ),
      h('a', { class: 'card menu-card', href: '#/kana/quiz' },
        h('div', { class: 'big-glyph' }, jp('問')),
        h('div', null, h('h2', null, '퀴즈 풀기'), h('p', { class: 'muted small' }, '문자 → 발음 / 발음 → 문자 고르기')),
      ),
      weakSection,
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
        h('div', { class: 'info muted small' }, '글자를 누르면 발음이 나와요. 빨간 점은 퀴즈에서 자주 틀린 글자예요.'),
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
  if (pendingPool) {
    const pool = pendingPool.map((c) => data.items.get(c)).filter(Boolean);
    pendingPool = null;
    const settings = { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) };
    startQuiz(ctx, pool, { ...settings, count: Math.max(5, Math.min(15, pool.length * 2)) });
  } else {
    renderSettings(ctx);
  }

  return () => document.removeEventListener('keydown', onKey);
}

function renderSettings(ctx) {
  const { data, root, setKeys } = ctx;
  const settings = { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) };
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
    h('p', { class: 'small muted', style: 'margin:0' }, '틀린 글자, 최근에 틀린 글자일수록 더 자주 나와요.'),
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
    const pool = data.all.filter(
      (it) => next.sections.includes(it.section) && (next.script === 'both' || it.script === next.script),
    );
    startQuiz(ctx, pool, next);
  });

  root.replaceChildren(
    h('div', { class: 'stack' },
      h('a', { href: '#/kana', class: 'muted small' }, '← 가나 복습'),
      h('h1', null, '가나 퀴즈'),
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
            if (session.results.length === 0 || confirm('퀴즈를 그만할까요? 지금까지 푼 기록은 저장돼요.')) renderSettings(ctx);
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
              onClick: () => startQuiz(ctx, wrongItems, { ...session.settings, count: Math.max(5, Math.min(15, wrongItems.length * 2)) }),
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
