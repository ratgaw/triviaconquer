import { CATEGORY_GROUPS, fetchQuestions } from './api.js';
import { celebrate } from './celebration.js';
import { buildChallengeUrl, parseChallengeFromUrl, shareChallenge } from './challenge.js';
import { fetchTopStreaks, submitStreak } from './leaderboard.js';
import { isValidNickname, sanitizeNickname } from './profanity-filter.js';

const root = document.getElementById('app');

const NICKNAME_KEY = 'triviaconquer:nickname';
const BEST_STREAK_KEY = 'triviaconquer:bestStreak';

const state = {
  view: 'setup', // 'setup' | 'challenge-intro' | 'playing' | 'summary' | 'leaderboard' | 'loading' | 'error'
  selectedGroups: new Set(),
  difficulty: 'any',
  amount: 10,
  questions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  longestStreakThisRound: 0,
  selectedAnswer: null,
  nickname: localStorage.getItem(NICKNAME_KEY) || '',
  bestStreakEver: Number(localStorage.getItem(BEST_STREAK_KEY) || 0),
  incomingChallenge: null,
  opponent: null,
  errorMessage: '',
  loadingMessage: '',
  leaderboardEntries: null,
  leaderboardStatus: 'idle', // 'idle' | 'loading' | 'loaded' | 'unavailable'
  leaderboardSubmitted: false,
  shareStatus: '',
};

function render() {
  switch (state.view) {
    case 'loading':
      return renderLoading();
    case 'setup':
      return renderSetup();
    case 'challenge-intro':
      return renderChallengeIntro();
    case 'playing':
      return renderPlaying();
    case 'summary':
      return renderSummary();
    case 'leaderboard':
      return renderLeaderboard();
    case 'error':
      return renderError();
  }
}

function renderLoading() {
  root.innerHTML = `<div class="loading"><div class="spinner"></div><p>${state.loadingMessage || 'Loading…'}</p></div>`;
}

function renderError() {
  root.innerHTML = `
    <div class="panel panel-animate error-panel">
      <p>${state.errorMessage}</p>
      <button class="btn btn-primary" id="back-to-setup">Back to setup</button>
    </div>
  `;
  document.getElementById('back-to-setup').addEventListener('click', () => {
    state.view = 'setup';
    render();
  });
}

// ---------- Setup ----------

function renderSetup() {
  const categoryChips = CATEGORY_GROUPS.map(
    (g) => `
      <button type="button" class="chip ${state.selectedGroups.has(g.id) ? 'chip--selected' : ''}" data-group-id="${g.id}">
        <span class="chip-emoji">${g.emoji}</span> ${g.name}
      </button>`
  ).join('');

  const difficulties = [
    { id: 'any', label: 'Any' },
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
  ];
  const difficultyPills = difficulties
    .map(
      (d) => `
      <button type="button" class="pill ${state.difficulty === d.id ? 'pill--selected' : ''}" data-difficulty="${d.id}">
        ${d.label}
      </button>`
    )
    .join('');

  const amounts = [5, 10, 15, 20];
  const amountOptions = amounts.map((a) => `<option value="${a}" ${state.amount === a ? 'selected' : ''}>${a} questions</option>`).join('');

  root.innerHTML = `
    <section class="panel panel-animate">
      <h2>1. Choose one or more categories</h2>
      <div class="chip-grid">${categoryChips}</div>

      <h2>2. Choose a difficulty</h2>
      <div class="pill-row">${difficultyPills}</div>

      <h2>3. How many questions?</h2>
      <select id="amount-select" class="select">${amountOptions}</select>

      <button type="button" id="start-btn" class="btn btn-primary btn-large" ${state.selectedGroups.size === 0 ? 'disabled' : ''}>
        Enter the Arena
      </button>
      <button type="button" id="view-leaderboard-btn" class="btn btn-secondary btn-large">🏆 Hall of Champions</button>
    </section>
  `;

  root.querySelectorAll('[data-group-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.groupId;
      if (state.selectedGroups.has(id)) state.selectedGroups.delete(id);
      else state.selectedGroups.add(id);
      renderSetup();
    });
  });

  root.querySelectorAll('[data-difficulty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.difficulty = btn.dataset.difficulty;
      renderSetup();
    });
  });

  document.getElementById('amount-select').addEventListener('change', (e) => {
    state.amount = Number(e.target.value);
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('view-leaderboard-btn').addEventListener('click', () => openLeaderboard('setup'));
}

async function startGame() {
  state.view = 'loading';
  state.loadingMessage = 'Fetching your questions…';
  render();

  try {
    const questions = await fetchQuestions({
      groupIds: [...state.selectedGroups],
      difficulty: state.difficulty,
      amount: state.amount,
    });

    if (questions.length === 0) {
      state.view = 'error';
      state.errorMessage = "Couldn't find enough questions for that combination. Try a different difficulty or more categories.";
      render();
      return;
    }

    beginRound(questions, null);
  } catch (err) {
    state.view = 'error';
    state.errorMessage = 'Something went wrong reaching the trivia service. Please try again.';
    render();
  }
}

function beginRound(questions, opponent) {
  state.questions = questions;
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.longestStreakThisRound = 0;
  state.selectedAnswer = null;
  state.opponent = opponent;
  state.leaderboardSubmitted = false;
  state.shareStatus = '';
  state.view = 'playing';
  render();
}

// ---------- Challenge intro ----------

function renderChallengeIntro() {
  const c = state.incomingChallenge;
  root.innerHTML = `
    <section class="panel panel-animate challenge-panel">
      <h2>⚔️ ${escapeHtml(c.fromName)} has thrown down the gauntlet!</h2>
      <p class="challenge-stats">They scored <strong>${c.fromScore}/${c.questions.length}</strong> with a streak of <strong>${c.fromStreak}</strong>. Enter the arena and see who prevails.</p>
      <button type="button" id="accept-challenge-btn" class="btn btn-primary btn-large">Accept the Duel</button>
      <button type="button" id="decline-challenge-btn" class="btn btn-secondary btn-large">Choose my own battleground instead</button>
    </section>
  `;

  document.getElementById('accept-challenge-btn').addEventListener('click', () => {
    const opponent = { name: c.fromName, score: c.fromScore, streak: c.fromStreak };
    clearChallengeFromUrl();
    beginRound(c.questions, opponent);
  });

  document.getElementById('decline-challenge-btn').addEventListener('click', () => {
    clearChallengeFromUrl();
    state.incomingChallenge = null;
    state.view = 'setup';
    render();
  });
}

function clearChallengeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('challenge');
  window.history.replaceState({}, '', url.toString());
}

// ---------- Playing ----------

function renderPlaying() {
  const q = state.questions[state.currentIndex];
  const revealed = state.selectedAnswer !== null;
  const progressPct = Math.round((state.currentIndex / state.questions.length) * 100);

  const answerButtons = q.answers
    .map((answer) => {
      let cls = 'answer-btn';
      if (revealed) {
        if (answer === q.correctAnswer) cls += ' answer-btn--correct';
        else if (answer === state.selectedAnswer) cls += ' answer-btn--incorrect';
        else cls += ' answer-btn--dimmed';
      }
      return `<button type="button" class="${cls}" data-answer="${encodeURIComponent(answer)}" ${revealed ? 'disabled' : ''}>${answer}</button>`;
    })
    .join('');

  root.innerHTML = `
    <section class="panel panel-animate play-panel">
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
        <span class="progress-label">Question ${state.currentIndex + 1} of ${state.questions.length}</span>
      </div>

      <div class="meta-row">
        <span class="badge">${q.category}</span>
        <span class="badge badge--${q.difficulty}">${q.difficulty}</span>
        <span class="streak-badge ${state.streak > 0 ? 'streak-badge--active' : ''}">🔥 ${state.streak}</span>
        <span class="score">Score: ${state.score}</span>
      </div>

      <h2 class="question-text">${q.question}</h2>

      <div class="answers ${q.type === 'boolean' ? 'answers--boolean' : ''}">${answerButtons}</div>

      ${revealed ? '<button type="button" id="next-btn" class="btn btn-primary btn-large">Next Question</button>' : ''}
    </section>
  `;

  if (!revealed) {
    root.querySelectorAll('[data-answer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const answer = decodeURIComponent(btn.dataset.answer);
        state.selectedAnswer = answer;
        if (answer === q.correctAnswer) {
          state.score += 1;
          state.streak += 1;
          state.longestStreakThisRound = Math.max(state.longestStreakThisRound, state.streak);
          celebrate(state.streak);
        } else {
          state.streak = 0;
        }
        renderPlaying();
      });
    });
  } else {
    document.getElementById('next-btn').addEventListener('click', nextQuestion);
  }
}

function nextQuestion() {
  state.selectedAnswer = null;
  state.currentIndex += 1;
  if (state.currentIndex >= state.questions.length) {
    if (state.longestStreakThisRound > state.bestStreakEver) {
      state.bestStreakEver = state.longestStreakThisRound;
      localStorage.setItem(BEST_STREAK_KEY, String(state.bestStreakEver));
    }
    state.view = 'summary';
  }
  render();
}

// ---------- Summary ----------

function renderSummary() {
  const total = state.questions.length;
  const pct = Math.round((state.score / total) * 100);
  const isNewBest = state.longestStreakThisRound > 0 && state.longestStreakThisRound === state.bestStreakEver;

  const opponentBlock = state.opponent
    ? (() => {
        const result =
          state.score > state.opponent.score
            ? '🏆 Victory is yours!'
            : state.score < state.opponent.score
              ? `Defeat — this round goes to ${escapeHtml(state.opponent.name)}.`
              : '⚔️ A hard-fought draw!';
        return `
        <div class="opponent-compare">
          <div class="opponent-col"><span class="opponent-label">You</span><span class="opponent-score">${state.score}/${total}</span><span class="opponent-streak">streak ${state.longestStreakThisRound}</span></div>
          <div class="opponent-vs">⚔️</div>
          <div class="opponent-col"><span class="opponent-label">${escapeHtml(state.opponent.name)}</span><span class="opponent-score">${state.opponent.score}/${total}</span><span class="opponent-streak">streak ${state.opponent.streak}</span></div>
        </div>
        <p class="opponent-result">${result}</p>
      `;
      })()
    : '';

  root.innerHTML = `
    <section class="panel panel-animate summary-panel">
      <h2>The Dust Settles</h2>
      <p class="summary-score">${state.score} / ${total} <span class="summary-pct">(${pct}%)</span></p>
      <p class="summary-streak">Best streak this round: <strong>${state.longestStreakThisRound}</strong>${isNewBest ? ' — a new personal record! 🏆' : ''}</p>

      ${opponentBlock}

      <div class="summary-section">
        <h3>🏆 Enter the Hall of Champions</h3>
        <div id="leaderboard-submit-area"></div>
      </div>

      <div class="summary-section">
        <h3>⚔️ Duel a Friend</h3>
        <button type="button" id="challenge-btn" class="btn btn-secondary btn-large">Send Duel Link</button>
        <p id="share-status" class="share-status">${state.shareStatus}</p>
      </div>

      <div class="summary-actions">
        <button type="button" id="replay-btn" class="btn btn-primary btn-large">Fight Again</button>
        <button type="button" id="new-settings-btn" class="btn btn-secondary btn-large">Choose New Battlegrounds</button>
      </div>
    </section>
  `;

  renderLeaderboardSubmitArea();

  document.getElementById('challenge-btn').addEventListener('click', onChallengeClick);
  document.getElementById('replay-btn').addEventListener('click', () => {
    if (state.selectedGroups.size > 0) startGame();
    else regenerateFallbackRound();
  });
  document.getElementById('new-settings-btn').addEventListener('click', () => {
    state.view = 'setup';
    render();
  });
}

function regenerateFallbackRound() {
  state.selectedGroups = new Set(['general']);
  state.difficulty = 'any';
  startGame();
}

function renderLeaderboardSubmitArea() {
  const area = document.getElementById('leaderboard-submit-area');
  if (!area) return;

  if (state.longestStreakThisRound === 0) {
    area.innerHTML = `<p class="muted">Land at least a 1-streak to earn your place in the Hall.</p>`;
    return;
  }

  if (state.leaderboardSubmitted) {
    area.innerHTML = `<p class="muted">✅ Inscribed! Check the <button type="button" id="jump-to-leaderboard" class="link-btn">Hall of Champions</button>.</p>`;
    document.getElementById('jump-to-leaderboard').addEventListener('click', () => openLeaderboard('summary'));
    return;
  }

  area.innerHTML = `
    <div class="nickname-row">
      <input type="text" id="nickname-input" class="text-input" placeholder="Your name, champion (max 16 chars)" maxlength="16" value="${escapeHtml(state.nickname)}" />
      <button type="button" id="submit-leaderboard-btn" class="btn btn-primary">Submit</button>
    </div>
    <p id="leaderboard-submit-message" class="submit-message"></p>
  `;

  document.getElementById('submit-leaderboard-btn').addEventListener('click', onSubmitLeaderboard);
}

async function onSubmitLeaderboard() {
  const input = document.getElementById('nickname-input');
  const messageEl = document.getElementById('leaderboard-submit-message');
  const clean = sanitizeNickname(input.value);

  if (!clean) {
    messageEl.textContent = 'Enter a nickname first.';
    return;
  }
  if (!isValidNickname(clean)) {
    messageEl.textContent = 'That nickname isn’t allowed — try something else.';
    return;
  }

  state.nickname = clean;
  localStorage.setItem(NICKNAME_KEY, clean);

  messageEl.textContent = 'Submitting…';
  const result = await submitStreak(clean, state.longestStreakThisRound);

  if (!result.ok) {
    messageEl.textContent = `Couldn't submit: ${result.error}`;
    return;
  }

  state.leaderboardSubmitted = true;
  state.leaderboardEntries = result.entries;
  state.leaderboardStatus = 'loaded';
  renderLeaderboardSubmitArea();
}

async function onChallengeClick() {
  const btn = document.getElementById('challenge-btn');
  btn.disabled = true;
  state.shareStatus = 'Forging your duel link…';
  document.getElementById('share-status').textContent = state.shareStatus;

  try {
    const groupIds = state.selectedGroups.size > 0 ? [...state.selectedGroups] : ['general'];
    const challengeQuestions = await fetchQuestions({ groupIds, difficulty: state.difficulty, amount: Math.min(state.amount, 10) });

    if (challengeQuestions.length === 0) {
      state.shareStatus = "Couldn't forge a duel right now — try again.";
      document.getElementById('share-status').textContent = state.shareStatus;
      btn.disabled = false;
      return;
    }

    const url = buildChallengeUrl({
      questions: challengeQuestions,
      fromName: state.nickname || 'A challenger',
      score: state.score,
      streak: state.longestStreakThisRound,
    });

    const result = await shareChallenge(url, `Can you beat my trivia streak of ${state.longestStreakThisRound}? Prove it.`);
    state.shareStatus = result === 'copied' ? 'Duel link copied to clipboard!' : result === 'shared' ? 'Gauntlet thrown!' : '';
  } catch {
    state.shareStatus = 'Something went wrong forging the link.';
  }

  document.getElementById('share-status').textContent = state.shareStatus;
  btn.disabled = false;
}

// ---------- Leaderboard ----------

function openLeaderboard(returnView) {
  state.leaderboardReturnView = returnView;
  state.view = 'leaderboard';
  render();
  loadLeaderboard();
}

async function loadLeaderboard() {
  state.leaderboardStatus = 'loading';
  const entries = await fetchTopStreaks();
  if (entries === null) {
    state.leaderboardStatus = 'unavailable';
  } else {
    state.leaderboardEntries = entries;
    state.leaderboardStatus = 'loaded';
  }
  if (state.view === 'leaderboard') render();
}

function renderLeaderboard() {
  let body;
  if (state.leaderboardStatus === 'loading') {
    body = `<div class="loading"><div class="spinner"></div><p>Consulting the scrolls…</p></div>`;
  } else if (state.leaderboardStatus === 'unavailable') {
    body = `<p class="muted">The Hall of Champions isn't available right now — this feature requires the site to be deployed on Cloudflare with the leaderboard KV binding set up (see README).</p>`;
  } else if (!state.leaderboardEntries || state.leaderboardEntries.length === 0) {
    body = `<p class="muted">No champions crowned yet today. Be the first to claim the laurel!</p>`;
  } else {
    const rows = state.leaderboardEntries
      .map(
        (e, i) => `
        <li class="leaderboard-row">
          <span class="leaderboard-rank">#${i + 1}</span>
          <span class="leaderboard-name">${escapeHtml(e.nickname)}</span>
          <span class="leaderboard-streak">🔥 ${e.streak}</span>
        </li>`
      )
      .join('');
    body = `<ol class="leaderboard-list">${rows}</ol>`;
  }

  root.innerHTML = `
    <section class="panel panel-animate">
      <h2>🏆 Hall of Champions</h2>
      <p class="muted small">Resets daily at midnight UTC.</p>
      ${body}
      <button type="button" id="leaderboard-back-btn" class="btn btn-primary btn-large">Back</button>
    </section>
  `;

  document.getElementById('leaderboard-back-btn').addEventListener('click', () => {
    state.view = state.leaderboardReturnView || 'setup';
    render();
  });
}

// ---------- Utilities ----------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Init ----------

function init() {
  const incoming = parseChallengeFromUrl();
  if (incoming) {
    state.incomingChallenge = incoming;
    state.view = 'challenge-intro';
  } else {
    state.view = 'setup';
  }
  render();
}

init();
