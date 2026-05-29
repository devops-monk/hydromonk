export interface Settings {
  intervalMinutes: number;
  dailyGoalGlasses: number;
  glassSizeMl: number;
  activeHoursStart: number;
  activeHoursEnd: number;
  weekdaysOnly: boolean;
  soundEnabled: boolean;
  remindersEnabled: boolean;
}

export interface LogEntry {
  time: number;
  ml: number;
}

export interface DailyLog {
  date: string;
  entries: LogEntry[];
}

export interface Stats {
  streak: number;
  longestStreak: number;
  lastGoalDate: string;
}

const DEFAULTS: Settings = {
  intervalMinutes: 60,
  dailyGoalGlasses: 8,
  glassSizeMl: 250,
  activeHoursStart: 8,
  activeHoursEnd: 20,
  weekdaysOnly: false,
  soundEnabled: true,
  remindersEnabled: true,
};

const DEFAULT_STATS: Stats = { streak: 0, longestStreak: 0, lastGoalDate: '' };

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get('hm_settings');
  return { ...DEFAULTS, ...(r['hm_settings'] as Partial<Settings> ?? {}) };
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await chrome.storage.local.set({ hm_settings: { ...cur, ...s } });
}

export async function getDailyLog(date?: string): Promise<DailyLog> {
  const d = date ?? todayStr();
  const r = await chrome.storage.local.get(`hm_log_${d}`);
  return (r[`hm_log_${d}`] as DailyLog | undefined) ?? { date: d, entries: [] };
}

export async function addEntry(ml: number): Promise<DailyLog> {
  const log = await getDailyLog();
  log.entries.push({ time: Date.now(), ml });
  await chrome.storage.local.set({ [`hm_log_${log.date}`]: log });
  return log;
}

export async function clearTodayLog(): Promise<void> {
  await chrome.storage.local.remove(`hm_log_${todayStr()}`);
}

export async function getStats(): Promise<Stats> {
  const r = await chrome.storage.local.get('hm_stats');
  return { ...DEFAULT_STATS, ...(r['hm_stats'] as Partial<Stats> ?? {}) };
}

export interface WeeklyEntry {
  date: string;
  dayLabel: string;
  totalMl: number;
  goalMet: boolean;
  isToday: boolean;
}

export async function getWeeklyHistory(goalGlasses: number, glassSizeMl: number): Promise<WeeklyEntry[]> {
  const goalMl = goalGlasses * glassSizeMl;
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const entries: WeeklyEntry[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const log = await getDailyLog(dateStr);
    const totalMl = log.entries.reduce((s, e) => s + e.ml, 0);
    entries.push({
      date: dateStr,
      dayLabel: DAY_NAMES[d.getDay()]!,
      totalMl,
      goalMet: totalMl >= goalMl,
      isToday: i === 0,
    });
  }
  return entries;
}

export async function checkAndUpdateStreak(settings: Settings): Promise<Stats> {
  const log = await getDailyLog();
  const totalMl = log.entries.reduce((s, e) => s + e.ml, 0);
  const goalMl = settings.dailyGoalGlasses * settings.glassSizeMl;
  const stats = await getStats();
  const d = todayStr();

  if (totalMl >= goalMl && stats.lastGoalDate !== d) {
    const prev = new Date();
    prev.setDate(prev.getDate() - 1);
    const prevStr = prev.toISOString().slice(0, 10);
    const newStreak = stats.lastGoalDate === prevStr ? stats.streak + 1 : 1;
    const updated: Stats = {
      streak: newStreak,
      longestStreak: Math.max(stats.longestStreak, newStreak),
      lastGoalDate: d,
    };
    await chrome.storage.local.set({ hm_stats: updated });
    return updated;
  }
  return stats;
}
