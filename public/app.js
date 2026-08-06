import { CATEGORY_GROUPS, fetchQuestions } from './api.js';
import { celebrate, tierFor, iconUrl } from './celebration.js';
import { buildChallengeUrl, parseChallengeFromUrl, shareChallenge } from './challenge.js';
import { fetchLeaderboard, submitToLeaderboard } from './leaderboard.js';
import { isValidNickname, sanitizeNickname } from './profanity-filter.js';
import { playCorrect, playWrong, isMuted, toggleMuted } from './sounds.js';
import { fetchRoundsToday, recordRoundStarted } from './stats.js';

const root = document.getElementById('app');

const NICKNAME_KEY = 'triviaconquer:nickname';
const BEST_STREAK_KEY = 'triviaconquer:bestStreak';
const ENDLESS_BATCH_SIZE = 10;
const MAX_LIVES = 5;
const LIFE_BONUS_INTERVAL = 10; // every N questions answered, +1 life automatically (capped)
const HARD_TRIAL_INTERVAL = 6; // every N questions answered, offer an opt-in hard question for a life

const state = {
  view: 'setup', // 'setup' | 'challenge-intro' | 'playing' | 'bonus-offer' | 'bonus-question' | 'endless-exhausted' | 'endless-add-category' | 'summary' | 'leaderboard' | 'loading' | 'error'
  selectedGroups: new Set(),
  difficulty: 'any',
  amount: 10, // number (5/10/15/20) or 'endless'
  mode: 'classic', // 'classic' | 'endless' — set when a round actually starts
  questions: [], // classic: the fixed round; endless: the not-yet-shown buffer
  currentIndex: 0, // classic only
  currentQuestion: null, // endless only
  totalAnswered: 0, // endless only
  endlessGroupIds: [], // endless only — can grow via "add another category"
  repeatsAllowedForRun: false, // endless only — set once the player opts into repeats
  addCategorySelection: new Set(),
  lives: MAX_LIVES, // endless only
  bonusQuestion: null, // endless only — the hard "trial" question, when offered
  bonusSelectedAnswer: null,
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
  leaderboardMode: 'classic',
  leaderboardEntries: null,
  leaderboardStatus: 'idle', // 'idle' | 'loading' | 'loaded' | 'unavailable'
  leaderboardSubmitted: false,
  shareStatus: '',
};

function render() {
  updateAdVisibility();
  switch (state.view) {
    case 'loading':
      return renderLoading();
    case 'setup':
      return renderSetup();
    case 'challenge-intro':
      return renderChallengeIntro();
    case 'playing':
      return renderPlaying();
    case 'bonus-offer':
      return renderBonusOffer();
    case 'bonus-question':
      return renderBonusQuestion();
    case 'endless-exhausted':
      return renderEndlessExhausted();
    case 'endless-add-category':
      return renderEndlessAddCategory();
    case 'summary':
      return renderSummary();
    case 'leaderboard':
      return renderLeaderboard();
    case 'error':
      return renderError();
  }
}

// AdSense's "valuable inventory" policy disallows ads on screens without real publisher
// content — so the ad slots (hidden by default in CSS) only ever show once app.js confirms
// there's actual content in #app, and stay hidden on the bare loading spinner and the
// one-line error screen.
function updateAdVisibility() {
  const showAds = state.view !== 'loading' && state.view !== 'error';
  document.querySelectorAll('.ad-slot').forEach((el) => {
    el.classList.toggle('ad-slot--visible', showAds);
  });
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

  const amounts = [5, 10, 15, 20, 'endless'];
  const amountOptions = amounts
    .map((a) => {
      const label = a === 'endless' ? '♾️ Endless (no limit)' : `${a} questions`;
      return `<option value="${a}" ${state.amount === a ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

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
      <p id="ambient-stat" class="ambient-stat"></p>
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
    state.amount = e.target.value === 'endless' ? 'endless' : Number(e.target.value);
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('view-leaderboard-btn').addEventListener('click', () => openLeaderboard('setup', 'classic'));
  loadAmbientStat();
}

async function loadAmbientStat() {
  const rounds = await fetchRoundsToday();
  const el = document.getElementById('ambient-stat');
  if (!el || !rounds) return; // hide entirely if unavailable or nothing played yet today
  el.textContent = `🔥 ${rounds} round${rounds === 1 ? '' : 's'} played today`;
}

async function startGame() {
  if (state.amount === 'endless') return startEndlessMode();

  state.mode = 'classic';
  state.view = 'loading';
  state.loadingMessage = 'Assembling your questions…';
  render();

  try {
    const { questions } = await fetchQuestions({
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
    state.errorMessage = 'Something went wrong reaching the trivia catalog. Please try again.';
    render();
  }
}

function beginRound(questions, opponent) {
  state.mode = 'classic';
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
  recordRoundStarted();
  render();
}

// ---------- Endless mode ----------

async function startEndlessMode() {
  state.mode = 'endless';
  state.endlessGroupIds = [...state.selectedGroups];
  state.repeatsAllowedForRun = false;
  state.view = 'loading';
  state.loadingMessage = 'Opening the endless arena…';
  render();

  const { questions } = await fetchQuestions({
    groupIds: state.endlessGroupIds,
    difficulty: state.difficulty,
    amount: ENDLESS_BATCH_SIZE,
  });

  if (questions.length === 0) {
    state.view = 'error';
    state.errorMessage = "Couldn't find any questions for that combination. Try different categories or difficulty.";
    render();
    return;
  }

  state.questions = questions;
  state.currentQuestion = state.questions.shift();
  state.totalAnswered = 0;
  state.score = 0;
  state.streak = 0;
  state.longestStreakThisRound = 0;
  state.lives = MAX_LIVES;
  state.selectedAnswer = null;
  state.opponent = null;
  state.leaderboardSubmitted = false;
  state.shareStatus = '';
  state.view = 'playing';
  recordRoundStarted();
  render();
}

// Called right after a normal endless question is answered (right or wrong). Handles the
// automatic life-bonus checkpoint and the opt-in hard-trial offer before actually advancing —
// running out of lives is handled separately, at the point of answering (see renderPlaying).
async function nextEndlessQuestion() {
  state.selectedAnswer = null;
  state.totalAnswered += 1;

  if (state.totalAnswered % LIFE_BONUS_INTERVAL === 0 && state.lives < MAX_LIVES) {
    state.lives += 1;
  }

  if (state.totalAnswered % HARD_TRIAL_INTERVAL === 0 && state.lives < MAX_LIVES) {
    state.view = 'bonus-offer';
    render();
    return;
  }

  await advanceToNextEndlessQuestion();
}

async function advanceToNextEndlessQuestion() {
  if (state.questions.length > 0) {
    state.currentQuestion = state.questions.shift();
    state.view = 'playing';
    render();
    return;
  }

  state.view = 'loading';
  state.loadingMessage = 'Finding your next question…';
  render();

  const { questions } = await fetchQuestions({
    groupIds: state.endlessGroupIds,
    difficulty: state.difficulty,
    amount: ENDLESS_BATCH_SIZE,
    allowRepeats: state.repeatsAllowedForRun,
  });

  if (questions.length === 0) {
    state.view = 'endless-exhausted';
    render();
    return;
  }

  state.questions = questions;
  state.currentQuestion = state.questions.shift();
  state.view = 'playing';
  render();
}

// ---------- Endless mode: opt-in hard trial for a bonus life ----------

function renderBonusOffer() {
  root.innerHTML = `
    <section class="panel panel-animate bonus-panel">
      <h2>⚡ A Trial Presents Itself</h2>
      <p class="muted">Answer one HARD question correctly to win back a life. No penalty if you get it wrong — this one's pure upside.</p>
      <button type="button" id="accept-bonus-btn" class="btn btn-primary btn-large">Accept the Trial</button>
      <button type="button" id="skip-bonus-btn" class="btn btn-secondary btn-large">Skip</button>
    </section>
  `;

  document.getElementById('accept-bonus-btn').addEventListener('click', startBonusQuestion);
  document.getElementById('skip-bonus-btn').addEventListener('click', advanceToNextEndlessQuestion);
}

async function startBonusQuestion() {
  state.view = 'loading';
  state.loadingMessage = 'Summoning a trial…';
  render();

  // Bonus trials are a side mechanic, not part of the main progression — allow repeats so they
  // never compete with (or get exhausted by) the main run's unseen-question pool.
  const { questions } = await fetchQuestions({
    groupIds: state.endlessGroupIds,
    difficulty: 'hard',
    amount: 1,
    allowRepeats: true,
  });

  if (questions.length === 0) {
    await advanceToNextEndlessQuestion();
    return;
  }

  state.bonusQuestion = questions[0];
  state.bonusSelectedAnswer = null;
  state.view = 'bonus-question';
  render();
}

function renderBonusQuestion() {
  const q = state.bonusQuestion;
  const revealed = state.bonusSelectedAnswer !== null;
  const won = revealed && state.bonusSelectedAnswer === q.correctAnswer;

  const answerButtons = q.answers
    .map((answer) => {
      let cls = 'answer-btn';
      if (revealed) {
        if (answer === q.correctAnswer) cls += ' answer-btn--correct';
        else if (answer === state.bonusSelectedAnswer) cls += ' answer-btn--incorrect';
        else cls += ' answer-btn--dimmed';
      }
      return `<button type="button" class="${cls}" data-answer="${encodeURIComponent(answer)}" ${revealed ? 'disabled' : ''}>${answer}</button>`;
    })
    .join('');

  root.innerHTML = `
    <section class="panel panel-animate bonus-panel">
      <div class="meta-row">
        <span class="badge">${q.category}</span>
        <span class="badge badge--hard">hard trial</span>
      </div>
      <h2 class="question-text">⚡ ${q.question}</h2>
      <div class="answers ${q.type === 'boolean' ? 'answers--boolean' : ''}">${answerButtons}</div>
      ${revealed ? `<p class="bonus-result">${won ? '🎉 A life restored!' : 'No life gained this time — no harm done.'}</p>` : ''}
      ${revealed ? '<button type="button" id="bonus-continue-btn" class="btn btn-primary btn-large">Continue</button>' : ''}
    </section>
  `;

  if (!revealed) {
    root.querySelectorAll('[data-answer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.bonusSelectedAnswer = decodeURIComponent(btn.dataset.answer);
        if (state.bonusSelectedAnswer === q.correctAnswer) {
          state.lives = Math.min(state.lives + 1, MAX_LIVES);
          playCorrect();
        } else {
          playWrong();
        }
        renderBonusQuestion();
      });
    });
  } else {
    document.getElementById('bonus-continue-btn').addEventListener('click', advanceToNextEndlessQuestion);
  }
}

function renderEndlessExhausted() {
  const plural = state.endlessGroupIds.length > 1 ? 'categories' : 'category';
  root.innerHTML = `
    <section class="panel panel-animate exhaustion-panel">
      <h2>🗺️ You've charted every question here!</h2>
      <p class="muted">You've answered <strong>${state.totalAnswered}</strong> questions this run with a best streak of <strong>${state.longestStreakThisRound}</strong>. From here, questions in your chosen ${plural} would start repeating.</p>
      <button type="button" id="exhaust-end-btn" class="btn btn-primary btn-large">End the Run</button>
      <button type="button" id="exhaust-continue-btn" class="btn btn-secondary btn-large">Continue Anyway (allow repeats)</button>
      <button type="button" id="exhaust-add-btn" class="btn btn-secondary btn-large">Add Another Category</button>
    </section>
  `;

  document.getElementById('exhaust-end-btn').addEventListener('click', endEndlessRun);
  document.getElementById('exhaust-continue-btn').addEventListener('click', continueEndlessWithRepeats);
  document.getElementById('exhaust-add-btn').addEventListener('click', () => {
    state.addCategorySelection = new Set();
    state.view = 'endless-add-category';
    render();
  });
}

function endEndlessRun() {
  if (state.longestStreakThisRound > state.bestStreakEver) {
    state.bestStreakEver = state.longestStreakThisRound;
    localStorage.setItem(BEST_STREAK_KEY, String(state.bestStreakEver));
  }
  state.view = 'summary';
  render();
}

async function continueEndlessWithRepeats() {
  state.repeatsAllowedForRun = true;
  state.view = 'loading';
  state.loadingMessage = 'Reshuffling the arena…';
  render();

  const { questions } = await fetchQuestions({
    groupIds: state.endlessGroupIds,
    difficulty: state.difficulty,
    amount: ENDLESS_BATCH_SIZE,
    allowRepeats: true,
  });

  if (questions.length === 0) {
    state.view = 'error';
    state.errorMessage = "There aren't any questions at all for this combination yet.";
    render();
    return;
  }

  state.questions = questions;
  state.currentQuestion = state.questions.shift();
  state.selectedAnswer = null;
  state.view = 'playing';
  render();
}

function renderEndlessAddCategory() {
  const chips = CATEGORY_GROUPS.map((g) => {
    const alreadyIn = state.endlessGroupIds.includes(g.id);
    const selected = alreadyIn || state.addCategorySelection.has(g.id);
    return `
      <button type="button" class="chip ${selected ? 'chip--selected' : ''}" data-group-id="${g.id}" ${alreadyIn ? 'disabled' : ''}>
        <span class="chip-emoji">${g.emoji}</span> ${g.name}${alreadyIn ? ' ✓' : ''}
      </button>`;
  }).join('');

  root.innerHTML = `
    <section class="panel panel-animate">
      <h2>Add a category to keep the run going</h2>
      <div class="chip-grid">${chips}</div>
      <button type="button" id="confirm-add-category-btn" class="btn btn-primary btn-large" ${state.addCategorySelection.size === 0 ? 'disabled' : ''}>Continue</button>
      <button type="button" id="cancel-add-category-btn" class="btn btn-secondary btn-large">Back</button>
    </section>
  `;

  root.querySelectorAll('[data-group-id]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.groupId;
      if (state.addCategorySelection.has(id)) state.addCategorySelection.delete(id);
      else state.addCategorySelection.add(id);
      renderEndlessAddCategory();
    });
  });

  document.getElementById('confirm-add-category-btn').addEventListener('click', confirmAddCategory);
  document.getElementById('cancel-add-category-btn').addEventListener('click', () => {
    state.view = 'endless-exhausted';
    render();
  });
}

async function confirmAddCategory() {
  state.endlessGroupIds = [...new Set([...state.endlessGroupIds, ...state.addCategorySelection])];
  state.view = 'loading';
  state.loadingMessage = 'Broadening the arena…';
  render();

  const { questions } = await fetchQuestions({
    groupIds: state.endlessGroupIds,
    difficulty: state.difficulty,
    amount: ENDLESS_BATCH_SIZE,
  });

  if (questions.length === 0) {
    state.view = 'endless-exhausted';
    render();
    return;
  }

  state.questions = questions;
  state.currentQuestion = state.questions.shift();
  state.selectedAnswer = null;
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
  const isEndless = state.mode === 'endless';
  const q = isEndless ? state.currentQuestion : state.questions[state.currentIndex];
  const revealed = state.selectedAnswer !== null;

  const progressLabel = isEndless
    ? `Question ${state.totalAnswered + 1}`
    : `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  const progressPct = isEndless ? 100 : Math.round((state.currentIndex / state.questions.length) * 100);

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

  const streakTier = state.streak > 0 ? tierFor(state.streak) : null;
  const streakBadgeStyle = streakTier ? ` style="--tier-color:${streakTier.color}"` : '';
  const streakBadgeIcon = streakTier
    ? `<img class="streak-badge-icon" src="${iconUrl(streakTier)}" alt="" />`
    : '🔥';

  const livesRow = isEndless
    ? `<div class="lives-row">${Array.from({ length: MAX_LIVES }, (_, i) => `<span class="life-icon ${i < state.lives ? 'life-icon--full' : 'life-icon--empty'}">${i < state.lives ? '❤️' : '🖤'}</span>`).join('')}</div>`
    : '';

  const outOfLives = isEndless && revealed && state.lives <= 0;

  root.innerHTML = `
    <section class="panel panel-animate play-panel">
      <div class="progress-row">
        <div class="progress-track ${isEndless ? 'progress-track--endless' : ''}"><div class="progress-fill" style="width:${progressPct}%"></div></div>
        <span class="progress-label">${progressLabel}${isEndless ? ' ♾️' : ''}</span>
      </div>

      ${livesRow}

      <div class="meta-row">
        <span class="badge">${q.category}</span>
        <span class="badge badge--${q.difficulty}">${q.difficulty}</span>
        <span class="streak-badge ${streakTier ? 'streak-badge--active' : ''}"${streakBadgeStyle}>${streakBadgeIcon} ${state.streak}</span>
        <span class="score">Score: ${state.score}</span>
      </div>

      <h2 class="question-text">${q.question}</h2>

      <div class="answers ${q.type === 'boolean' ? 'answers--boolean' : ''}">${answerButtons}</div>

      ${revealed && q.explanation ? `<div class="explanation-box"><span class="explanation-label">📜 Did you know?</span><p>${escapeHtml(q.explanation)}</p></div>` : ''}

      ${outOfLives ? '<p class="out-of-lives-note">💀 Out of lives — your run ends here.</p>' : ''}
      ${revealed ? `<button type="button" id="next-btn" class="btn btn-primary btn-large">${outOfLives ? 'See Your Fate' : 'Next Question'}</button>` : ''}
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
          playCorrect();
          celebrate(state.streak);
        } else {
          state.streak = 0;
          if (isEndless) state.lives = Math.max(0, state.lives - 1);
          playWrong();
        }
        renderPlaying();
      });
    });
  } else {
    document.getElementById('next-btn').addEventListener('click', () => {
      if (outOfLives) return endEndlessRun();
      return isEndless ? nextEndlessQuestion() : nextQuestion();
    });
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
  const isEndless = state.mode === 'endless';
  const total = isEndless ? state.totalAnswered : state.questions.length;
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

  const diedToLives = isEndless && state.lives <= 0;
  const summaryHeading = diedToLives ? 'Your Legend Ends Here' : 'The Dust Settles';

  const scoreBlock = isEndless
    ? `<p class="summary-score">${state.totalAnswered} <span class="summary-pct">questions survived</span></p>`
    : `<p class="summary-score">${state.score} / ${total} <span class="summary-pct">(${Math.round((state.score / total) * 100)}%)</span></p>`;

  const leaderboardMode = isEndless ? 'endless' : 'classic';
  const leaderboardValue = isEndless ? state.totalAnswered : state.score;
  const qualifies = isEndless ? state.totalAnswered > 0 : state.amount === 20;
  const leaderboardTitle = isEndless ? '🏆 Enter the Endless Hall of Champions (longest run)' : '🏆 Enter the Classic Hall of Champions (20Q)';

  root.innerHTML = `
    <section class="panel panel-animate summary-panel">
      <h2>${summaryHeading}</h2>
      ${scoreBlock}
      <p class="summary-streak">Best streak this round: <strong>${state.longestStreakThisRound}</strong>${isNewBest ? ' — a new personal record! 🏆' : ''}</p>

      ${opponentBlock}

      <div class="summary-section">
        <h3>${leaderboardTitle}</h3>
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

  renderLeaderboardSubmitArea(leaderboardMode, leaderboardValue, qualifies, { streak: state.longestStreakThisRound });

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
  state.amount = 10;
  startGame();
}

function renderLeaderboardSubmitArea(mode, value, qualifies, extra = {}) {
  const area = document.getElementById('leaderboard-submit-area');
  if (!area) return;

  if (!qualifies) {
    area.innerHTML =
      mode === 'classic'
        ? `<p class="muted">Play a 20-question round to qualify for the Classic leaderboard.</p>`
        : `<p class="muted">Answer at least one question to earn your place in the Endless Hall.</p>`;
    return;
  }

  if (state.leaderboardSubmitted) {
    area.innerHTML = `<p class="muted">✅ Inscribed! Check the <button type="button" id="jump-to-leaderboard" class="link-btn">Hall of Champions</button>.</p>`;
    document.getElementById('jump-to-leaderboard').addEventListener('click', () => openLeaderboard('summary', mode));
    return;
  }

  area.innerHTML = `
    <div class="nickname-row">
      <input type="text" id="nickname-input" class="text-input" placeholder="Your name, champion (max 16 chars)" maxlength="16" value="${escapeHtml(state.nickname)}" />
      <button type="button" id="submit-leaderboard-btn" class="btn btn-primary">Submit</button>
    </div>
    <p id="leaderboard-submit-message" class="submit-message"></p>
  `;

  document.getElementById('submit-leaderboard-btn').addEventListener('click', () => onSubmitLeaderboard(mode, value, extra));
}

async function onSubmitLeaderboard(mode, value, extra = {}) {
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
  const result = await submitToLeaderboard(mode, clean, value, extra);

  if (!result.ok) {
    messageEl.textContent = `Couldn't submit: ${result.error}`;
    return;
  }

  state.leaderboardSubmitted = true;
  state.leaderboardEntries = result.entries;
  state.leaderboardStatus = 'loaded';
  state.leaderboardMode = mode;
  renderLeaderboardSubmitArea(mode, value, true);
}

async function onChallengeClick() {
  const btn = document.getElementById('challenge-btn');
  btn.disabled = true;
  state.shareStatus = 'Forging your duel link…';
  document.getElementById('share-status').textContent = state.shareStatus;

  try {
    const activeGroupIds = state.mode === 'endless' ? state.endlessGroupIds : [...state.selectedGroups];
    const groupIds = activeGroupIds.length > 0 ? activeGroupIds : ['general'];
    const challengeAmount = typeof state.amount === 'number' ? Math.min(state.amount, 10) : 10;
    const { questions: challengeQuestions } = await fetchQuestions({ groupIds, difficulty: state.difficulty, amount: challengeAmount });

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

function openLeaderboard(returnView, mode = 'classic') {
  state.leaderboardReturnView = returnView;
  state.leaderboardMode = mode;
  state.view = 'leaderboard';
  render();
  loadLeaderboardEntries();
}

async function loadLeaderboardEntries() {
  state.leaderboardStatus = 'loading';
  const entries = await fetchLeaderboard(state.leaderboardMode);
  if (entries === null) {
    state.leaderboardStatus = 'unavailable';
  } else {
    state.leaderboardEntries = entries;
    state.leaderboardStatus = 'loaded';
  }
  if (state.view === 'leaderboard') render();
}

function renderLeaderboard() {
  const tabs = `
    <div class="leaderboard-tabs">
      <button type="button" class="leaderboard-tab ${state.leaderboardMode === 'classic' ? 'leaderboard-tab--active' : ''}" data-mode="classic">Classic (20Q)</button>
      <button type="button" class="leaderboard-tab ${state.leaderboardMode === 'endless' ? 'leaderboard-tab--active' : ''}" data-mode="endless">Endless (longest run)</button>
    </div>
  `;

  let body;
  if (state.leaderboardStatus === 'loading') {
    body = `<div class="loading"><div class="spinner"></div><p>Consulting the scrolls…</p></div>`;
  } else if (state.leaderboardStatus === 'unavailable') {
    body = `<p class="muted">The Hall of Champions isn't available right now — this feature requires the site to be deployed on Cloudflare with the leaderboard KV binding set up (see README).</p>`;
  } else if (!state.leaderboardEntries || state.leaderboardEntries.length === 0) {
    body = `<p class="muted">No champions crowned yet today. Be the first to claim the laurel!</p>`;
  } else {
    const rows = state.leaderboardEntries
      .map((e, i) => {
        const valueLabel = state.leaderboardMode === 'classic' ? `${e.value}/20` : `${e.value} questions`;
        const streakLabel =
          state.leaderboardMode === 'endless' && Number.isInteger(e.streak) ? `<span class="leaderboard-sub">🔥 best streak ${e.streak}</span>` : '';
        return `
        <li class="leaderboard-row">
          <span class="leaderboard-rank">#${i + 1}</span>
          <span class="leaderboard-name">${escapeHtml(e.nickname)}</span>
          <span class="leaderboard-value-col"><span class="leaderboard-streak">${valueLabel}</span>${streakLabel}</span>
        </li>`;
      })
      .join('');
    body = `<ol class="leaderboard-list">${rows}</ol>`;
  }

  root.innerHTML = `
    <section class="panel panel-animate">
      <h2>🏆 Hall of Champions</h2>
      ${tabs}
      <p class="muted small">Resets daily at midnight UTC.</p>
      ${body}
      <button type="button" id="leaderboard-back-btn" class="btn btn-primary btn-large">Back</button>
    </section>
  `;

  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.leaderboardMode = btn.dataset.mode;
      render();
      loadLeaderboardEntries();
    });
  });

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

function initSoundToggle() {
  const btn = document.getElementById('sound-toggle-btn');
  if (!btn) return;
  const updateIcon = () => {
    btn.textContent = isMuted() ? '🔇' : '🔊';
  };
  updateIcon();
  btn.addEventListener('click', () => {
    toggleMuted();
    updateIcon();
  });
}

function init() {
  initSoundToggle();

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
