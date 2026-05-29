import {
  getSettings, getDailyLog, addEntry, checkAndUpdateStreak,
  todayStr, type Settings,
} from '../utils/storage';

const ALARM   = 'hm-reminder';
const MIDNIGHT = 'hm-midnight';


const FACTS = [
  '73% of your brain is water — hydration sharpens focus and memory.',
  'Just 1% dehydration can drop your productivity by 12%.',
  'Drinking water jumpstarts metabolism by up to 24%.',
  '75% of headaches are caused by mild dehydration — drink up!',
  'Drinking 20–30 min before meals helps control appetite.',
  'Your joints are 80% water — hydration keeps them flexible.',
  '3–4% dehydration can cut work performance by up to 50%.',
  'Water flushes toxins through your kidneys and skin.',
  'The 3 PM energy slump? A full glass of water often beats it.',
  'Consistent hydration improves skin elasticity within days.',
  '60% of your body weight is water — replenish it throughout the day.',
  'Mild dehydration mimics the cognitive effects of a 0.08 BAC.',
  'Drinking water before bed reduces the risk of heart attack.',
  'Only 23% of desk workers drink enough water daily.',
];

// ── Badge ─────────────────────────────────────────────────────────────────────
async function updateBadge(logged: number, goal: number) {
  const done = logged >= goal;
  await chrome.action.setBadgeText({ text: done ? '✓' : String(logged) });
  await chrome.action.setBadgeBackgroundColor({ color: done ? '#22d3ee' : '#0ea5e9' });
}

// ── Alarm scheduling — preserves timer if interval unchanged ──────────────────
async function scheduleAlarm(intervalMinutes: number, force = false) {
  const existing = await chrome.alarms.get(ALARM);
  if (!force && existing && existing.periodInMinutes === intervalMinutes) {
    return; // Same interval → keep the existing countdown running
  }
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { delayInMinutes: intervalMinutes, periodInMinutes: intervalMinutes });
}

// ── Active time check ─────────────────────────────────────────────────────────
async function isActiveTime(s: Settings): Promise<boolean> {
  if (!s.remindersEnabled) return false;
  const now = new Date();
  const h = now.getHours();
  const day = now.getDay();
  if (s.weekdaysOnly && (day === 0 || day === 6)) return false;
  return h >= s.activeHoursStart && h < s.activeHoursEnd;
}


// ── Fire notification ─────────────────────────────────────────────────────────
async function notify() {
  const settings = await getSettings();
  if (!(await isActiveTime(settings))) return;

  const log = await getDailyLog();
  const totalMl  = log.entries.reduce((s, e) => s + e.ml, 0);
  const logged   = Math.floor(totalMl / settings.glassSizeMl);
  const goalMl   = settings.dailyGoalGlasses * settings.glassSizeMl;
  const remaining = Math.max(0, Math.ceil((goalMl - totalMl) / settings.glassSizeMl));

  const fact  = FACTS[Math.floor(Math.random() * FACTS.length)]!;
  const title = logged >= settings.dailyGoalGlasses
    ? '🎉 Daily goal reached! Keep it up!'
    : `💧 Time to hydrate! (${logged}/${settings.dailyGoalGlasses} glasses)`;
  const message = remaining > 0
    ? `${remaining} glass${remaining > 1 ? 'es' : ''} to go. ${fact}`
    : `Goal complete! ${fact}`;

  chrome.notifications.create(ALARM, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    buttons: [{ title: '✓ Drank a glass' }, { title: '⏰ Snooze 10 min' }],
    requireInteraction: false,
    silent: !settings.soundEnabled,
  });
}

// ── Notification button clicks ────────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener(async (id, idx) => {
  if (id !== ALARM) return;
  if (idx === 0) {
    const s = await getSettings();
    const log = await addEntry(s.glassSizeMl);
    const total = log.entries.reduce((a, e) => a + e.ml, 0);
    await updateBadge(Math.floor(total / s.glassSizeMl), s.dailyGoalGlasses);
    await checkAndUpdateStreak(s);
  } else {
    await chrome.alarms.clear(ALARM);
    const s = await getSettings();
    chrome.alarms.create(ALARM, { delayInMinutes: 10, periodInMinutes: s.intervalMinutes });
  }
  chrome.notifications.clear(id);
});

// ── Alarm fires ───────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM)    await notify();
  if (alarm.name === MIDNIGHT) {
    const s = await getSettings();
    await updateBadge(0, s.dailyGoalGlasses);
  }
});

// ── Install / startup ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  await scheduleAlarm(s.intervalMinutes, true);
  const midnight = new Date();
  midnight.setHours(24, 0, 5, 0);
  chrome.alarms.create(MIDNIGHT, {
    delayInMinutes: (midnight.getTime() - Date.now()) / 60000,
    periodInMinutes: 1440,
  });
});

chrome.runtime.onStartup.addListener(async () => {
  const s = await getSettings();
  const log = await getDailyLog();
  const total = log.entries.reduce((a, e) => a + e.ml, 0);
  await updateBadge(Math.floor(total / s.glassSizeMl), s.dailyGoalGlasses);
});

// ── Messages from popup ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'reschedule') {
    const force = msg.force === true;
    scheduleAlarm(msg.intervalMinutes as number, force).then(() => respond({ ok: true }));
    return true;
  }
  if (msg.action === 'nextAlarm') {
    chrome.alarms.get(ALARM).then(a => respond({ scheduledTime: a?.scheduledTime ?? null }));
    return true;
  }
});
