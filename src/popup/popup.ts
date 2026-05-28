import {
  getSettings, saveSettings, getDailyLog, addEntry, clearTodayLog,
  getStats, checkAndUpdateStreak, type Settings,
} from '../utils/storage';

// ── Rotating facts ──────────────────────────────────────────────────────────
const FACTS = [
  '73% of your brain is water — hydration sharpens focus and memory.',
  'Just 1% dehydration can drop your productivity by 12%.',
  'Drinking water jumpstarts metabolism by up to 24%.',
  '75% of headaches are caused by mild dehydration — drink up!',
  'Drinking 20–30 min before meals helps control appetite.',
  'Your joints are 80% water — hydration keeps them flexible.',
  'The 3 PM slump? A full glass of water often beats it.',
  'Consistent hydration improves skin elasticity within days.',
  '60% of your body weight is water — replenish it all day long.',
  'Mild dehydration can mimic the cognitive effects of a 0.08 BAC.',
];

// ── State ───────────────────────────────────────────────────────────────────
let settings: Settings;
let nextAlarmMs: number | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}L` : `${n}ml`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function playDrink() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch { /* noop */ }
}

function showToast(msg: string) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ── Water circle ─────────────────────────────────────────────────────────────
function updateCircle(logged: number, goal: number) {
  const pct = goal > 0 ? Math.min(100, Math.round((logged / goal) * 100)) : 0;
  const fill = document.getElementById('water-fill')!;
  fill.style.height = `${pct}%`;

  document.getElementById('circle-count')!.textContent = String(logged);
  document.getElementById('circle-goal')!.textContent = String(goal);
  document.getElementById('circle-pct')!.textContent = `${pct}%`;

  // Adjust text color for readability when fill is high
  const content = document.querySelector('.circle-content') as HTMLElement;
  content.style.color = pct > 50 ? '#fff' : 'var(--text)';

  const badge = document.getElementById('goal-badge')!;
  badge.classList.toggle('hidden', logged < goal);
}

// ── Log list ────────────────────────────────────────────────────────────────
function renderLog(entries: { time: number; ml: number }[]) {
  const list = document.getElementById('log-list')!;
  if (entries.length === 0) {
    list.innerHTML = '<div class="log-empty">No water logged yet today</div>';
    return;
  }
  list.innerHTML = [...entries].reverse().map(e => `
    <div class="log-entry">
      <span class="log-drop">💧</span>
      <span class="log-ml">${fmt(e.ml)}</span>
      <span class="log-time">${fmtTime(e.time)}</span>
    </div>
  `).join('');
}

// ── Stats row ────────────────────────────────────────────────────────────────
function updateStats(totalMl: number, goalMl: number) {
  document.getElementById('stat-intake')!.textContent = fmt(totalMl);
  document.getElementById('stat-goal-ml')!.textContent = fmt(goalMl);
}

// ── Countdown to next reminder ───────────────────────────────────────────────
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById('stat-next')!;

  const tick = () => {
    if (!nextAlarmMs || !settings.remindersEnabled) { el.textContent = '—'; return; }
    const ms = nextAlarmMs - Date.now();
    if (ms <= 0) { el.textContent = 'Now!'; return; }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    el.textContent = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ── Full refresh ─────────────────────────────────────────────────────────────
async function refresh() {
  settings = await getSettings();
  const log = await getDailyLog();
  const stats = await getStats();

  const totalMl = log.entries.reduce((s, e) => s + e.ml, 0);
  const goalMl = settings.dailyGoalGlasses * settings.glassSizeMl;
  const logged = Math.floor(totalMl / settings.glassSizeMl);

  updateCircle(logged, settings.dailyGoalGlasses);
  updateStats(totalMl, goalMl);
  renderLog(log.entries);

  // Streak badge
  const streakBadge = document.getElementById('streak-badge')!;
  if (stats.streak > 0) {
    document.getElementById('streak-num')!.textContent = `${stats.streak}d`;
    streakBadge.classList.remove('hidden');
  } else {
    streakBadge.classList.add('hidden');
  }

  // Random fact
  document.getElementById('fact-text')!.textContent = FACTS[Math.floor(Math.random() * FACTS.length)];

  // Next alarm
  chrome.runtime.sendMessage({ action: 'nextAlarm' }, res => {
    nextAlarmMs = res?.scheduledTime ?? null;
    startCountdown();
  });
}

// ── Log water ────────────────────────────────────────────────────────────────
async function logWater(ml: number) {
  if (ml <= 0 || ml > 5000) return;
  playDrink();
  await addEntry(ml);
  await checkAndUpdateStreak(settings);
  await refresh();
  showToast(`+${fmt(ml)} logged! 💧`);
}

// ── Quick add buttons ─────────────────────────────────────────────────────────
document.getElementById('quick-add-row')!.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('[data-ml]') as HTMLButtonElement | null;
  if (btn) await logWater(parseInt(btn.dataset['ml']!));
});

// Custom amount
document.getElementById('btn-custom')!.addEventListener('click', () => {
  document.getElementById('custom-input-row')!.classList.remove('hidden');
  document.getElementById('quick-add-row')!.classList.add('hidden');
  document.getElementById('custom-ml')!.focus();
});
document.getElementById('btn-cancel-custom')!.addEventListener('click', () => {
  document.getElementById('custom-input-row')!.classList.add('hidden');
  document.getElementById('quick-add-row')!.classList.remove('hidden');
});
document.getElementById('btn-add-custom')!.addEventListener('click', async () => {
  const val = parseInt((document.getElementById('custom-ml') as HTMLInputElement).value);
  if (val > 0) {
    document.getElementById('custom-input-row')!.classList.add('hidden');
    document.getElementById('quick-add-row')!.classList.remove('hidden');
    (document.getElementById('custom-ml') as HTMLInputElement).value = '';
    await logWater(val);
  }
});
document.getElementById('custom-ml')!.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-custom')!.click();
});

// Clear log
document.getElementById('btn-clear-log')!.addEventListener('click', async () => {
  await clearTodayLog();
  await refresh();
});

// ── Navigation ────────────────────────────────────────────────────────────────
function showView(id: string) {
  document.querySelectorAll('.slide-view').forEach(v => v.classList.add('hidden'));
  if (id) document.getElementById(id)!.classList.remove('hidden');
}

document.getElementById('btn-settings')!.addEventListener('click', () => {
  loadSettingsUI();
  showView('settings-view');
  document.getElementById('btn-settings')!.classList.add('active');
});
document.getElementById('btn-back-settings')!.addEventListener('click', () => {
  showView('');
  document.getElementById('btn-settings')!.classList.remove('active');
});
document.getElementById('btn-benefits')!.addEventListener('click', () => showView('benefits-view'));
document.getElementById('btn-back-benefits')!.addEventListener('click', () => showView(''));

// ── Settings UI ───────────────────────────────────────────────────────────────
function loadSettingsUI() {
  // Segmented buttons
  initSeg('seg-interval', String(settings.intervalMinutes));
  initSeg('seg-glass', String(settings.glassSizeMl));

  (document.getElementById('goal-num') as HTMLElement).textContent = String(settings.dailyGoalGlasses);
  (document.getElementById('time-start') as HTMLInputElement).value = padTime(settings.activeHoursStart);
  (document.getElementById('time-end') as HTMLInputElement).value = padTime(settings.activeHoursEnd);
  (document.getElementById('toggle-weekdays') as HTMLInputElement).checked = settings.weekdaysOnly;
  (document.getElementById('toggle-sound') as HTMLInputElement).checked = settings.soundEnabled;
  (document.getElementById('toggle-enabled') as HTMLInputElement).checked = settings.remindersEnabled;
}

function padTime(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function initSeg(groupId: string, activeVal: string) {
  document.querySelectorAll<HTMLButtonElement>(`#${groupId} .seg-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset['val'] === activeVal);
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>(`#${groupId} .seg-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// Goal stepper
let localGoal = 8;
document.getElementById('btn-goal-down')!.addEventListener('click', () => {
  localGoal = Math.max(1, localGoal - 1);
  document.getElementById('goal-num')!.textContent = String(localGoal);
});
document.getElementById('btn-goal-up')!.addEventListener('click', () => {
  localGoal = Math.min(30, localGoal + 1);
  document.getElementById('goal-num')!.textContent = String(localGoal);
});

// Weight calculator
document.getElementById('btn-calc-goal')!.addEventListener('click', () => {
  const kg = parseFloat((document.getElementById('weight-input') as HTMLInputElement).value);
  const resultEl = document.getElementById('calc-result')!;
  if (!kg || kg < 30 || kg > 300) {
    resultEl.textContent = 'Please enter a valid weight (30–300 kg).';
    resultEl.classList.remove('hidden');
    return;
  }
  const ml = Math.round(kg * 33);
  const glass = (document.querySelector('#seg-glass .seg-btn.active') as HTMLButtonElement)?.dataset['val'];
  const glassSize = parseInt(glass ?? '250');
  const glasses = Math.round(ml / glassSize);
  localGoal = Math.max(4, Math.min(20, glasses));
  document.getElementById('goal-num')!.textContent = String(localGoal);
  resultEl.textContent = `Recommended: ~${ml}ml/day ≈ ${localGoal} glasses of ${glassSize}ml. Goal updated! ✓`;
  resultEl.classList.remove('hidden');
});

// Save settings
document.getElementById('btn-save-settings')!.addEventListener('click', async () => {
  const intervalBtn = document.querySelector('#seg-interval .seg-btn.active') as HTMLButtonElement | null;
  const glassBtn = document.querySelector('#seg-glass .seg-btn.active') as HTMLButtonElement | null;

  const startRaw = (document.getElementById('time-start') as HTMLInputElement).value;
  const endRaw = (document.getElementById('time-end') as HTMLInputElement).value;
  const startHour = startRaw ? parseInt(startRaw.split(':')[0]!) : 8;
  const endHour = endRaw ? parseInt(endRaw.split(':')[0]!) : 20;
  const intervalMinutes = parseInt(intervalBtn?.dataset['val'] ?? '60');

  await saveSettings({
    intervalMinutes,
    dailyGoalGlasses: localGoal,
    glassSizeMl: parseInt(glassBtn?.dataset['val'] ?? '250'),
    activeHoursStart: startHour,
    activeHoursEnd: endHour,
    weekdaysOnly: (document.getElementById('toggle-weekdays') as HTMLInputElement).checked,
    soundEnabled: (document.getElementById('toggle-sound') as HTMLInputElement).checked,
    remindersEnabled: (document.getElementById('toggle-enabled') as HTMLInputElement).checked,
  });

  chrome.runtime.sendMessage({ action: 'reschedule', intervalMinutes });
  showToast('Settings saved ✓');
  showView('');
  document.getElementById('btn-settings')!.classList.remove('active');
  await refresh();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
refresh();
