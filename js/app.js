// 앱 진입점: 해시 기반 라우터 + 홈 화면
import { h, jp } from './ui.js';
import { kanaHome, kanaChart, kanaQuiz, kanaSummary } from './kana.js';

const routes = {
  '': { tab: 'home', view: home },
  kana: { tab: 'kana', view: kanaHome },
  'kana/chart': { tab: 'kana', view: kanaChart },
  'kana/quiz': { tab: 'kana', view: kanaQuiz },
  vocab: { tab: 'vocab', view: (root) => comingSoon(root, '기초 어휘 플래시카드', '語') },
  sentences: { tab: 'sentences', view: (root) => comingSoon(root, '문장 독해 연습', '文') },
};

let cleanup = null;

async function render() {
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const route = routes[path] || routes[''];
  const root = document.getElementById('app');

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === route.tab);
  });

  root.replaceChildren();
  window.scrollTo(0, 0);
  try {
    cleanup = await route.view(root);
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      h('div', { class: 'card' },
        h('h2', null, '문제가 생겼어요'),
        h('p', { class: 'muted' }, '데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.'),
        h('button', { class: 'btn', onClick: () => location.reload() }, '새로고침'),
      ),
    );
  }
}

function menuCard({ href, glyph, title, desc, disabled }) {
  return h('a', { class: 'card menu-card' + (disabled ? ' disabled' : ''), href },
    h('div', { class: 'big-glyph' }, jp(glyph)),
    h('div', null,
      h('h2', null, title, disabled ? ' ' : '', disabled ? h('span', { class: 'badge' }, '준비 중') : null),
      h('p', { class: 'muted small' }, desc),
    ),
  );
}

async function home(root) {
  const summary = await kanaSummary();
  root.append(
    h('section', { class: 'stack' },
      h('div', null,
        h('h1', null, '오늘도 한 글자씩 ', jp('よもう!')),
        h('p', { class: 'muted' }, '게임이나 틱톡 댓글 속 일본어를 읽을 수 있을 때까지.'),
      ),
      summary.seen > 0
        ? h('div', { class: 'card row' },
            h('div', null,
              h('div', { class: 'small muted' }, '가나 연습 기록'),
              h('div', null, h('b', null, `${summary.seen}`), ` / ${summary.total}자 풀어 봄 · 정답률 `, h('b', null, `${summary.accuracy}%`)),
            ),
            h('div', { class: 'spacer' }),
            summary.weak > 0 ? h('span', { class: 'badge' }, `약한 글자 ${summary.weak}개`) : null,
          )
        : null,
      menuCard({ href: '#/kana', glyph: 'あ', title: '히라가나·가타카나 복습', desc: '오십음도 보기 · 퀴즈 · 헷갈리는 글자 집중 연습' }),
      menuCard({ href: '#/vocab', glyph: '語', title: '기초 어휘 플래시카드', desc: '인사·일상·게임/SNS 단어를 후리가나와 함께', disabled: true }),
      menuCard({ href: '#/sentences', glyph: '文', title: '문장 독해 연습', desc: '짧은 일본어 문장을 읽고 뜻 고르기', disabled: true }),
    ),
  );
}

function comingSoon(root, title, glyph) {
  root.append(
    h('div', { class: 'card center stack' },
      h('div', { class: 'prompt' }, jp(glyph, 'q-glyph')),
      h('h1', null, title),
      h('p', { class: 'muted' }, '다음 단계에서 추가될 기능이에요. 먼저 가나 복습부터 해 볼까요?'),
      h('a', { class: 'btn primary block', href: '#/kana' }, '가나 복습하러 가기'),
    ),
  );
}

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
