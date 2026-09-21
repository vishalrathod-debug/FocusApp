import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUsageStats } from '../native/AppUsageStatsBridge';

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'STOPPED';
export type FocusMode = 'Normal' | 'Adaptive' | 'Hard Focus';

export interface Session {
  id: string;
  mode: FocusMode;
  phase?: 'focus' | 'break';
  plannedMinutes: number;
  breakMinutes?: number;
  startedAt: string;
  status: SessionStatus;
  endedAt?: string;
  actualMinutes?: number;
  reason?: string;
  pausedMs?: number;
}

export interface Settings {
  hardFocus: boolean;
  strictFocus: boolean;
  penaltyMinutes: number;
  defaultMinutes: number;
  focusMinutes: number;
  breakMinutes: number;
  emergencyCode: string;
}

export type ScreenUsageMap = Record<string, number>;

export interface DeviceAppUsageEntry {
  name: string;
  packageName: string;
  minutes: number;
  icon?: string;
}

export type SettingsListener = (settings: Settings) => void;

const KEY = '@focusapp/mvp/v1';
const settingsListeners = new Set<SettingsListener>();
const DEFAULT: { version: number; sessions: Session[]; settings: Settings; screenUsage: ScreenUsageMap } = {
  version: 1,
  sessions: [],
  settings: { hardFocus: false, strictFocus: false, penaltyMinutes: 5, defaultMinutes: 25, focusMinutes: 25, breakMinutes: 5, emergencyCode: '1234' },
  screenUsage: { Home: 0, History: 0, Insights: 0, Settings: 0 },
};

export const sanitizeEmergencyCode = (value?: string): string => {
  const cleaned = (value ?? '').replace(/\D/g, '').slice(0, 4);
  return cleaned;
};

export const clampMinutes = (value: number, min: number, max: number): number => {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const read = async (): Promise<{ version: number; sessions: Session[]; settings: Settings; screenUsage: ScreenUsageMap }> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : DEFAULT;
    return {
      ...DEFAULT,
      ...saved,
      settings: { ...DEFAULT.settings, ...(saved?.settings ?? {}) },
      sessions: Array.isArray(saved?.sessions) ? saved.sessions : DEFAULT.sessions,
      screenUsage: { ...DEFAULT.screenUsage, ...(saved?.screenUsage ?? {}) },
    };
  } catch {
    return DEFAULT;
  }
};

const write = async (value: { version: number; sessions: Session[]; settings: Settings; screenUsage: ScreenUsageMap }) =>
  AsyncStorage.setItem(KEY, JSON.stringify(value));

export const startSession = ({
  mode,
  plannedMinutes,
  phase = 'focus',
  breakMinutes = 5,
}: {
  mode: FocusMode;
  plannedMinutes: number;
  phase?: 'focus' | 'break';
  breakMinutes?: number;
}): Session => ({
  id: String(Date.now()),
  mode,
  phase,
  plannedMinutes,
  breakMinutes,
  startedAt: new Date().toISOString(),
  status: 'ACTIVE',
  pausedMs: 0,
});

export const finishSession = (session: Session, status: SessionStatus = 'COMPLETED', reason?: string): Session => {
  const totalMs = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
  const pausedMs = Math.max(0, session.pausedMs ?? 0);
  const activeMs = Math.max(0, totalMs - pausedMs);

  return {
    ...session,
    status,
    reason,
    endedAt: new Date().toISOString(),
    actualMinutes: Math.max(0, Math.round(activeMs / 60000)),
  };
};

export const saveSession = async (session: Session): Promise<Session[]> => {
  const data = await read();
  const nextSessions = [session, ...data.sessions.filter((item) => item.id !== session.id)]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 300);

  data.sessions = nextSessions;
  await write(data);
  return data.sessions;
};

export const getSessions = async (): Promise<Session[]> =>
  [...(await read()).sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
export const getSettings = async (): Promise<Settings> => (await read()).settings;

export const subscribeToSettings = (listener: SettingsListener) => {
  settingsListeners.add(listener);

  return () => {
    settingsListeners.delete(listener);
  };
};

const notifySettingsListeners = async () => {
  const latest = await getSettings();
  settingsListeners.forEach((listener) => listener(latest));
};

export const saveSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const data = await read();
  const nextSettings = { ...data.settings, ...settings };
  nextSettings.focusMinutes = clampMinutes(nextSettings.focusMinutes ?? nextSettings.defaultMinutes ?? 25, 15, 120);
  nextSettings.defaultMinutes = nextSettings.focusMinutes;
  nextSettings.breakMinutes = clampMinutes(nextSettings.breakMinutes ?? 5, 5, 30);
  nextSettings.emergencyCode = sanitizeEmergencyCode(nextSettings.emergencyCode) || '1234';
  data.settings = nextSettings;
  await write(data);
  await notifySettingsListeners();
  return data.settings;
};

export const clearHistory = async (): Promise<{ version: number; sessions: Session[]; settings: Settings; screenUsage: ScreenUsageMap }> => {
  const data = await read();
  data.sessions = [];
  data.screenUsage = { ...DEFAULT.screenUsage };
  await write(data);
  return data;
};

export const getAdaptiveMinutes = async (): Promise<number> => {
  const sessions = await getSessions();
  return sessions.slice(0, 3).filter((s) => s.status === 'FAILED').length >= 2 ? 15 : 25;
};

export const getScreenUsage = async (): Promise<ScreenUsageMap> => (await read()).screenUsage;

export const getCycleMinutes = ({
  phase,
  focusMinutes,
  breakMinutes,
}: {
  phase: 'focus' | 'break';
  focusMinutes: number;
  breakMinutes: number;
}) => (phase === 'break' ? clampMinutes(breakMinutes ?? 5, 5, 30) : clampMinutes(focusMinutes ?? 25, 15, 120));

export const getScreenTimeTotal = (usage: ScreenUsageMap): number =>
  Object.values(usage).reduce((total, value) => total + Number(value || 0), 0);

const HIDDEN_APP_USAGE_PACKAGES = new Set([
  'com.focusapp',
  'android',
  'com.android.systemui',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
  'com.sec.android.app.launcher',
  'com.android.settings',
  'com.google.android.gms',
]);

const shouldHideAppUsage = (packageName?: string): boolean => {
  const normalized = (packageName ?? '').trim().toLowerCase();
  if (!normalized) return false;

  if (HIDDEN_APP_USAGE_PACKAGES.has(normalized)) return true;
  if (normalized.includes('launcher') || normalized.includes('systemui') || normalized.includes('settings')) return true;
  if (normalized === 'android' || normalized === 'com.android.systemui') return true;

  return false;
};

const APP_NAME_OVERRIDES: Record<string, string> = {
  'com.google.android.youtube': 'YouTube',
  'com.google.android.apps.youtube.music': 'YouTube Music',
  'com.android.chrome': 'Chrome',
  'com.instagram.android': 'Instagram',
  'com.facebook.katana': 'Facebook',
  'com.whatsapp': 'WhatsApp',
};

const sanitizeAppDisplayName = (name?: string, packageName?: string): string => {
  const rawName = (name ?? '').trim();
  const rawPackage = (packageName ?? '').trim();

  if (rawPackage && APP_NAME_OVERRIDES[rawPackage]) {
    return APP_NAME_OVERRIDES[rawPackage];
  }

  if (!rawName) return rawPackage || 'Unknown app';
  if (rawName === rawPackage) return APP_NAME_OVERRIDES[rawPackage] ?? rawName;
  if (/^[a-z0-9.]+$/.test(rawName) && rawName.includes('.')) {
    return APP_NAME_OVERRIDES[rawPackage] ?? (rawPackage || rawName);
  }

  return rawName;
};

export const normalizeAppUsageEntries = (
  entries: Array<{ name?: string; packageName?: string; totalMs?: number; minutes?: number; icon?: string }> = [],
): DeviceAppUsageEntry[] => {
  const merged = new Map<string, DeviceAppUsageEntry>();

  entries.forEach((entry) => {
    const packageName = (entry.packageName ?? '').trim();
    const key = packageName || (entry.name ?? '').trim();

    if (!key) return;

    const existing = merged.get(key);
    const minutes = Number(entry.minutes ?? Math.max(0, Math.round((Number(entry.totalMs ?? 0)) / 60000)));
    const nextMinutes = Number.isFinite(minutes) ? minutes : 0;

    if (existing) {
      existing.minutes += nextMinutes;
      existing.icon = existing.icon || entry.icon;
      existing.name = sanitizeAppDisplayName(existing.name, existing.packageName);
      return;
    }

    merged.set(key, {
      name: sanitizeAppDisplayName(entry.name, packageName || entry.name),
      packageName: packageName || entry.name || 'unknown',
      minutes: nextMinutes,
      icon: entry.icon,
    });
  });

  return Array.from(merged.values())
    .filter((entry) => entry.minutes >= 1 && !shouldHideAppUsage(entry.packageName))
    .sort((usageA, usageB) => usageB.minutes - usageA.minutes || usageA.name.localeCompare(usageB.name));
};

export const getAppUsageBreakdown = (usage: ScreenUsageMap) =>
  Object.entries(usage)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([name, value]) => ({ name, minutes: Math.round(Number(value || 0) / 60) }))
    .sort((usageA, usageB) => usageB.minutes - usageA.minutes);

export const isDeviceUsageAccessEnabled = async (): Promise<boolean> => {
  try {
    return await AppUsageStats.isUsageAccessEnabled();
  } catch {
    return false;
  }
};

export const getDeviceAppUsage = async (): Promise<DeviceAppUsageEntry[]> => {
  try {
    const rawEntries = await AppUsageStats.getAppUsage();
    return normalizeAppUsageEntries(rawEntries);
  } catch {
    return [];
  }
};

export const saveScreenUsage = async (usage: ScreenUsageMap): Promise<ScreenUsageMap> => {
  const data = await read();
  data.screenUsage = { ...DEFAULT.screenUsage, ...usage };
  await write(data);
  return data.screenUsage;
};

export const computeInsights = (sessions: Session[]) => {
  const complete = sessions.filter((s) => s.status === 'COMPLETED');
  const failed = sessions.filter((s) => s.status === 'FAILED').length;
  let streak = 0;

  for (const s of sessions) {
    if (s.status !== 'COMPLETED') break;
    streak += 1;
  }

  const hours = complete.reduce<Record<number, number>>((accumulator, session) => {
    const h = new Date(session.startedAt).getHours();
    accumulator[h] = (accumulator[h] || 0) + 1;
    return accumulator;
  }, {});

  const bestHour = Object.entries(hours).sort(([, countA], [, countB]) => countB - countA)[0]?.[0];

  return {
    total: sessions.length,
    completed: complete.length,
    failed,
    streak,
    averageLength: complete.length
      ? Math.round(complete.reduce((total, session) => total + (session.actualMinutes || session.plannedMinutes), 0) / complete.length)
      : 0,
    bestHour: bestHour === undefined ? 'No data yet' : `${bestHour}:00`,
  };
};
