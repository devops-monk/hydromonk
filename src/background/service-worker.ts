import {
  getSettings, getDailyLog, addEntry, checkAndUpdateStreak,
  todayStr, type Settings,
} from '../utils/storage';

const ALARM   = 'hm-reminder';
const MIDNIGHT = 'hm-midnight';

// Sites where we skip the in-page overlay (user is in a meeting / focused)
const MEETING_HOSTS = [
  'meet.google.com', 'zoom.us', 'teams.microsoft.com',
  'web.skype.com', 'discord.com', 'whereby.com', 'webex.com',
];

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

// ── In-page overlay (self-contained function injected into active tab) ────────
// Must have no external references — it is serialised and run as a content script.
function overlayScript(p: {
  glassesLogged: number; goalGlasses: number;
  fact: string; glassSizeMl: number;
}): void {
  if ((window as Window & { __hmActive?: boolean }).__hmActive) return;
  (window as Window & { __hmActive?: boolean }).__hmActive = true;

  const style = document.createElement('style');
  style.textContent = [
    '@keyframes __hmIn{from{opacity:0;transform:translateX(-50%) translateY(-14px) scale(.96)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}',
    '@keyframes __hmOut{to{opacity:0;transform:translateX(-50%) translateY(-10px) scale(.96)}}',
    '@keyframes __hmBar{from{width:100%}to{width:0%}}',
    '#__hm button{cursor:pointer;font-family:inherit}',
    '#__hm #__hmLog:hover{opacity:.88}',
    '#__hm #__hmSnz:hover{border-color:rgba(56,189,248,.4);color:#e0f2fe}',
    '#__hm #__hmX:hover{color:rgba(224,242,254,.7)}',
  ].join('');
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = '__hm';
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;width:320px;animation:__hmIn .3s cubic-bezier(.34,1.56,.64,1)';

  el.innerHTML = `
<div style="background:rgba(4,10,22,.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(56,189,248,.28);border-radius:16px;padding:15px 17px;box-shadow:0 10px 40px rgba(0,0,0,.65),0 0 0 1px rgba(56,189,248,.07)">
  <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
    <span style="font-size:22px;flex-shrink:0;margin-top:1px">💧</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:700;color:#e0f2fe;line-height:1.3">Time to hydrate!</div>
      <div style="font-size:11px;color:rgba(224,242,254,.5);margin-top:2px">${p.glassesLogged} of ${p.goalGlasses} glasses today</div>
    </div>
    <button id="__hmX" style="background:none;border:none;color:rgba(224,242,254,.3);font-size:17px;padding:2px 4px;line-height:1;flex-shrink:0;transition:color .15s">✕</button>
  </div>
  <div style="font-size:11px;color:rgba(56,189,248,.85);margin-bottom:12px;padding:7px 10px;background:rgba(14,165,233,.08);border-radius:8px;line-height:1.5">💡 ${p.fact}</div>
  <div style="display:flex;gap:7px">
    <button id="__hmLog" style="flex:1;height:35px;background:linear-gradient(135deg,#0ea5e9,#0284c7);border:none;color:#fff;font-weight:700;font-size:13px;border-radius:9px;transition:opacity .15s">✓ Drank ${p.glassSizeMl}ml</button>
    <button id="__hmSnz" style="height:35px;padding:0 11px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:rgba(224,242,254,.6);font-size:11px;border-radius:9px;white-space:nowrap;transition:all .15s">⏰ 10 min</button>
  </div>
  <div style="margin-top:9px;height:2px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden">
    <div style="height:100%;background:linear-gradient(90deg,#38bdf8,#0ea5e9);border-radius:99px;animation:__hmBar 8s linear forwards"></div>
  </div>
</div>`.trim();

  document.body.appendChild(el);

  const dismiss = (animate = true) => {
    const node = document.getElementById('__hm');
    if (!node) return;
    (window as Window & { __hmActive?: boolean }).__hmActive = false;
    if (animate) {
      node.style.animation = '__hmOut .2s ease forwards';
      setTimeout(() => { node.remove(); style.remove(); }, 220);
    } else { node.remove(); style.remove(); }
  };

  const timer = setTimeout(() => dismiss(), 8000);
  const cr = (window as Window & { chrome?: typeof chrome }).chrome;

  document.getElementById('__hmX')!.onclick = () => { clearTimeout(timer); dismiss(); };
  document.getElementById('__hmLog')!.onclick = () => {
    clearTimeout(timer);
    cr?.runtime.sendMessage({ action: 'logFromOverlay', ml: p.glassSizeMl });
    dismiss();
  };
  document.getElementById('__hmSnz')!.onclick = () => {
    clearTimeout(timer);
    cr?.runtime.sendMessage({ action: 'snoozeFromOverlay' });
    dismiss();
  };
}

// ── Inject overlay into active tab ────────────────────────────────────────────
async function injectOverlay(
  params: { glassesLogged: number; goalGlasses: number; fact: string; glassSizeMl: number }
) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) return;

    // Skip non-web pages and meeting sites
    if (!tab.url.startsWith('http')) return;
    try {
      const host = new URL(tab.url).hostname;
      if (MEETING_HOSTS.some(h => host.includes(h))) return;
    } catch { return; }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: overlayScript,
      args: [params],
    });
  } catch { /* tab may not be scriptable */ }
}

// ── Fire notification + overlay ───────────────────────────────────────────────
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

  // OS notification
  chrome.notifications.create(ALARM, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    buttons: [{ title: '✓ Drank a glass' }, { title: '⏰ Snooze 10 min' }],
    requireInteraction: false,
    silent: !settings.soundEnabled,
  });

  // In-page overlay (shown simultaneously so meeting users don't miss it)
  await injectOverlay({
    glassesLogged: logged,
    goalGlasses:   settings.dailyGoalGlasses,
    fact,
    glassSizeMl:   settings.glassSizeMl,
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

// ── Messages from popup and overlay ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'reschedule') {
    // Only force-restart if the interval actually changed
    const force = msg.force === true;
    scheduleAlarm(msg.intervalMinutes as number, force).then(() => respond({ ok: true }));
    return true;
  }
  if (msg.action === 'nextAlarm') {
    chrome.alarms.get(ALARM).then(a => respond({ scheduledTime: a?.scheduledTime ?? null }));
    return true;
  }
  if (msg.action === 'logFromOverlay') {
    (async () => {
      const s = await getSettings();
      const ml = (msg.ml as number) || s.glassSizeMl;
      const log = await addEntry(ml);
      const total = log.entries.reduce((a, e) => a + e.ml, 0);
      await updateBadge(Math.floor(total / s.glassSizeMl), s.dailyGoalGlasses);
      await checkAndUpdateStreak(s);
      respond({ ok: true });
    })();
    return true;
  }
  if (msg.action === 'snoozeFromOverlay') {
    (async () => {
      await chrome.alarms.clear(ALARM);
      const s = await getSettings();
      chrome.alarms.create(ALARM, { delayInMinutes: 10, periodInMinutes: s.intervalMinutes });
      respond({ ok: true });
    })();
    return true;
  }
});
