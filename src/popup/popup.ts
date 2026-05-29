import {
  getSettings, saveSettings, getDailyLog, addEntry, clearTodayLog,
  getStats, checkAndUpdateStreak, getWeeklyHistory, type Settings,
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
// entryCount = actual number of log entries (matches the log list)
// totalMl / goalMl drive the fill % so it stays ml-accurate
function updateCircle(entryCount: number, goal: number, totalMl: number, goalMl: number) {
  const pct = goalMl > 0 ? Math.min(100, Math.round((totalMl / goalMl) * 100)) : 0;
  const fill = document.getElementById('water-fill')!;
  fill.style.height = `${pct}%`;

  document.getElementById('circle-count')!.textContent = String(entryCount);
  document.getElementById('circle-goal')!.textContent = String(goal);
  document.getElementById('circle-pct')!.textContent = `${pct}%`;

  const content = document.querySelector('.circle-content') as HTMLElement;
  content.style.color = pct > 50 ? '#fff' : 'var(--text)';

  const badge = document.getElementById('goal-badge')!;
  badge.classList.toggle('hidden', totalMl < goalMl);
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
  const goalMl  = settings.dailyGoalGlasses * settings.glassSizeMl;
  const entryCount = log.entries.length;        // matches the log list exactly
  const logged     = Math.floor(totalMl / settings.glassSizeMl); // for badge/goal checks

  updateCircle(entryCount, settings.dailyGoalGlasses, totalMl, goalMl);
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

  // Celebrate goal completion (once per session, tracked in sessionStorage)
  if (logged >= settings.dailyGoalGlasses && totalMl > 0) {
    const celebKey = `hm_celebrated_${new Date().toISOString().slice(0, 10)}`;
    if (!sessionStorage.getItem(celebKey)) {
      sessionStorage.setItem(celebKey, '1');
      setTimeout(triggerConfetti, 200);
    }
  }
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

document.getElementById('btn-history')!.addEventListener('click', async () => {
  await renderHistory();
  showView('history-view');
  document.getElementById('btn-history')!.classList.add('active');
});
document.getElementById('btn-back-history')!.addEventListener('click', () => {
  showView('');
  document.getElementById('btn-history')!.classList.remove('active');
});

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

  // Only force-restart the timer if the interval actually changed
  const intervalChanged = intervalMinutes !== settings.intervalMinutes;
  chrome.runtime.sendMessage({ action: 'reschedule', intervalMinutes, force: intervalChanged });
  showToast('Settings saved ✓');
  showView('');
  document.getElementById('btn-settings')!.classList.remove('active');
  await refresh();
});

// ── History chart ─────────────────────────────────────────────────────────────
async function renderHistory() {
  const week = await getWeeklyHistory(settings.dailyGoalGlasses, settings.glassSizeMl);
  const stats = await getStats();
  const goalMl = settings.dailyGoalGlasses * settings.glassSizeMl;

  // Summary stats
  const daysWithData = week.filter(d => d.totalMl > 0);
  const avgMl = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.totalMl, 0) / daysWithData.length)
    : 0;
  const daysHit = week.filter(d => d.goalMet).length;
  document.getElementById('hs-avg')!.textContent = avgMl > 0 ? fmt(avgMl) : '—';
  document.getElementById('hs-days')!.textContent = `${daysHit}/7`;
  document.getElementById('hs-streak')!.textContent = `${stats.longestStreak}d`;

  // SVG bar chart
  const svg = document.getElementById('hist-chart')!;
  const svgW = 294, chartH = 58, topPad = 5, labelH = 22;
  const slotW = svgW / 7;
  const barW = 22;

  let svgContent = '';

  // Goal line (dashed) at top of bar area
  svgContent += `<line x1="0" y1="${topPad}" x2="${svgW}" y2="${topPad}" stroke="rgba(56,189,248,0.2)" stroke-dasharray="4 3" stroke-width="1"/>`;

  week.forEach((day, i) => {
    const barH = goalMl > 0 ? Math.max(2, Math.min(chartH, (day.totalMl / goalMl) * chartH)) : 0;
    const x = i * slotW + (slotW - barW) / 2;
    const y = topPad + chartH - barH;
    const fill = day.isToday
      ? 'url(#todayGrad)'
      : day.goalMet ? '#0ea5e9' : 'rgba(56,189,248,0.2)';
    const labelY = topPad + chartH + labelH - 4;

    svgContent += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" rx="4" fill="${fill}"/>`;
    svgContent += `<text x="${(x + barW / 2).toFixed(1)}" y="${labelY}" text-anchor="middle" fill="${day.isToday ? '#38bdf8' : 'rgba(224,242,254,0.4)'}" font-size="10" font-family="-apple-system,sans-serif" font-weight="${day.isToday ? '700' : '400'}">${day.dayLabel}</text>`;
    if (day.totalMl > 0) {
      const mlLabel = day.totalMl >= 1000 ? `${(day.totalMl / 1000).toFixed(1)}L` : `${day.totalMl}`;
      svgContent += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="rgba(224,242,254,0.5)" font-size="8" font-family="-apple-system,sans-serif">${mlLabel}</text>`;
    }
  });

  // Gradient definition for today's bar
  svgContent = `<defs><linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs>` + svgContent;
  svg.innerHTML = svgContent;

  // Per-day rows
  const container = document.getElementById('hist-days')!;
  container.innerHTML = '';
  [...week].reverse().forEach(day => {
    const pct = goalMl > 0 ? Math.min(100, (day.totalMl / goalMl) * 100) : 0;
    const d = new Date(day.date + 'T00:00:00');
    const label = day.isToday ? 'Today' : `${day.dayLabel} ${d.getDate()}`;
    const row = document.createElement('div');
    row.className = `hist-day-row${day.goalMet ? ' goal-met' : ''}${day.isToday ? ' today' : ''}`;
    row.innerHTML = `
      <span class="hist-day-label">${label}</span>
      <div class="hist-day-bar-wrap">
        <div class="hist-day-bar ${day.goalMet ? 'goal-met' : 'partial'}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span class="hist-day-ml">${day.totalMl > 0 ? fmt(day.totalMl) : '—'}</span>
      <span class="hist-day-badge">${day.goalMet ? '✅' : day.totalMl > 0 ? '🔵' : '⬜'}</span>`;
    container.appendChild(row);
  });
}

// ── Goal celebration confetti ─────────────────────────────────────────────────
function triggerConfetti() {
  const layer = document.getElementById('confetti-layer')!;
  layer.classList.remove('hidden');
  layer.innerHTML = '';
  const colors = ['#38bdf8', '#0ea5e9', '#06b6d4', '#67e8f9', '#7dd3fc', '#bae6fd', '#22d3ee', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)]!;
    const left   = Math.random() * 100;
    const delay  = Math.random() * 0.7;
    const dur    = 1.4 + Math.random() * 0.8;
    const rotate = Math.random() > 0.5 ? 'scaleX(-1)' : '';
    piece.style.cssText = `left:${left}%;background:${color};transform:${rotate};animation-duration:${dur}s;animation-delay:${delay}s`;
    layer.appendChild(piece);
  }
  setTimeout(() => { layer.classList.add('hidden'); layer.innerHTML = ''; }, 2800);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
refresh();
