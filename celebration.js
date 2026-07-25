// Confetti burst + streak toast, scaling in size/intensity with the current streak.
// No external animation library — a handful of absolutely-positioned divs animated by CSS
// (see .confetti-piece / .streak-toast in styles.css), removed once their animation finishes.

const PALETTE = ['#5b3df5', '#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585'];

function tierFor(streak) {
  if (streak >= 10) return { level: 4, label: `UNSTOPPABLE! 🔥 ${streak} streak`, particles: 44, fontRem: 2.4 };
  if (streak >= 5) return { level: 3, label: `On fire! 🔥 ${streak} streak`, particles: 30, fontRem: 1.9 };
  if (streak >= 3) return { level: 2, label: `${streak} in a row! 🔥`, particles: 18, fontRem: 1.5 };
  return { level: 1, label: streak === 1 ? 'Correct!' : `${streak} streak`, particles: 8, fontRem: 1.15 };
}

function spawnConfetti(count, level) {
  const container = document.createElement('div');
  container.className = 'confetti-layer';
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = PALETTE[i % PALETTE.length];
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.animationDuration = `${900 + Math.random() * (400 + level * 150)}ms`;
    piece.style.animationDelay = `${Math.random() * 150}ms`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 2200);
}

function spawnStreakToast(label, fontRem, level) {
  const el = document.createElement('div');
  el.className = `streak-toast streak-toast--level${level}`;
  el.style.fontSize = `${fontRem}rem`;
  el.textContent = label;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

export function celebrate(streak) {
  const tier = tierFor(streak);
  spawnConfetti(tier.particles, tier.level);
  spawnStreakToast(tier.label, tier.fontRem, tier.level);
}
