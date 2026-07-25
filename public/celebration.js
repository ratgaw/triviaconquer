// Confetti burst + streak toast, escalating through a mythological ascension as the streak
// grows: minor favor, legendary heroes, monstrous trials, then major gods, up to Zeus himself.
// Tier artwork is single-color SVG from game-icons.net (CC BY 3.0 — see README credits),
// pre-colored per tier and stored in icons/gods/. No external animation library — a handful of
// absolutely-positioned divs animated by CSS (see .confetti-piece / .streak-toast / .fx-flash
// in styles.css), removed once their animation finishes.
import { playTierUp, playThunder } from './sounds.js';

const TIERS = [
  { min: 1, icon: 'muses', color: '#8a6bff', message: (s) => `Touched by the Muses — ${s} streak`, particles: 8, fontRem: 1.1 },
  { min: 2, icon: 'hermes', color: '#7d94a8', message: (s) => `Swift as Hermes — ${s} streak`, particles: 12, fontRem: 1.2 },
  { min: 3, icon: 'athena', color: '#5c7a99', message: (s) => `Wisdom of Athena — ${s} streak`, particles: 16, fontRem: 1.35 },
  { min: 4, icon: 'apollo', color: '#e0a83e', message: (s) => `Blessing of Apollo — ${s} streak`, particles: 20, fontRem: 1.5 },
  { min: 5, icon: 'heracles', color: '#b8792e', message: (s) => `Strength of Heracles — ${s} streak`, particles: 24, fontRem: 1.65 },
  { min: 6, icon: 'odysseus', color: '#8a5a2b', message: (s) => `Cunning of Odysseus — ${s} streak`, particles: 26, fontRem: 1.75 },
  { min: 7, icon: 'minotaur', color: '#7a4a2b', message: (s) => `The Labyrinth falls — ${s} streak`, particles: 28, fontRem: 1.85 },
  { min: 9, icon: 'hydra', color: '#4c7a3d', message: (s) => `The Hydra's heads fall — ${s} streak`, particles: 32, fontRem: 2 },
  { min: 11, icon: 'poseidon', color: '#2f5d73', message: (s) => `Wrath of Poseidon — ${s} streak`, particles: 36, fontRem: 2.1, effect: 'shake' },
  { min: 14, icon: 'ares', color: '#a23325', message: (s) => `Fury of Ares — ${s} streak`, particles: 40, fontRem: 2.25, effect: 'shake' },
  { min: 18, icon: 'hera', color: '#6b3fa0', message: (s) => `Hera, Queen of Olympus, watches — ${s} streak`, particles: 44, fontRem: 2.4, effect: 'glow' },
  { min: 24, icon: 'zeus', color: '#d4a94a', message: (s) => `ZEUS, KING OF OLYMPUS, SMILES UPON YOU — ${s} streak`, particles: 52, fontRem: 2.6, effect: 'lightning' },
];

export function tierFor(streak) {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (streak >= t.min) tier = t;
  }
  return tier;
}

export function iconUrl(tier) {
  return `icons/gods/${tier.icon}.svg`;
}

function spawnConfetti(tier) {
  const container = document.createElement('div');
  container.className = 'confetti-layer';
  document.body.appendChild(container);

  const palette = [tier.color, '#d4a94a', '#3a2b1a'];

  for (let i = 0; i < tier.particles; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = palette[i % palette.length];
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.animationDuration = `${900 + Math.random() * 550}ms`;
    piece.style.animationDelay = `${Math.random() * 150}ms`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 2200);
}

function spawnStreakToast(tier, streak) {
  const el = document.createElement('div');
  el.className = 'streak-toast';
  el.style.fontSize = `${tier.fontRem}rem`;
  el.style.color = tier.color;

  const icon = document.createElement('img');
  icon.className = 'streak-toast-icon';
  icon.src = iconUrl(tier);
  icon.alt = '';
  icon.style.width = `${tier.fontRem}em`;
  icon.style.height = `${tier.fontRem}em`;

  const text = document.createElement('span');
  text.textContent = tier.message(streak);

  el.append(icon, text);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function spawnScreenEffect(tier) {
  if (!tier.effect) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (tier.effect === 'shake' || tier.effect === 'lightning') {
    document.body.classList.add('fx-shake');
    setTimeout(() => document.body.classList.remove('fx-shake'), 420);
  }

  if (tier.effect === 'glow' || tier.effect === 'lightning') {
    const flash = document.createElement('div');
    flash.className = tier.effect === 'lightning' ? 'fx-flash fx-flash--lightning' : 'fx-flash';
    flash.style.setProperty('--flash-color', tier.color);
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }
}

export function celebrate(streak) {
  const tier = tierFor(streak);
  spawnConfetti(tier);
  spawnStreakToast(tier, streak);
  spawnScreenEffect(tier);

  if (tier.effect === 'lightning') playThunder();
  else playTierUp(TIERS.indexOf(tier));
}
