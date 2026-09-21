const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
}));

import {
  clearHistory,
  clampMinutes,
  finishSession,
  getAppUsageBreakdown,
  getCycleMinutes,
  getScreenTimeTotal,
  getSessions,
  normalizeAppUsageEntries,
  sanitizeEmergencyCode,
  saveSession,
  saveSettings,
  startSession,
  subscribeToSettings,
} from '../src/services/SessionService';

describe('SessionService', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it('subtracts paused time from actual focus duration', () => {
    const session = {
      ...startSession({ mode: 'Normal', plannedMinutes: 25 }),
      startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      pausedMs: 3 * 60 * 1000,
    } as any;

    const finished = finishSession(session, 'COMPLETED');

    expect(finished.actualMinutes).toBe(7);
  });

  it('clamps focus and break values to the configured limits', () => {
    expect(clampMinutes(200, 15, 120)).toBe(120);
    expect(clampMinutes(5, 15, 120)).toBe(15);
    expect(clampMinutes(60, 5, 30)).toBe(30);
    expect(clampMinutes(2, 5, 30)).toBe(5);
  });

  it('clears stored session history and screen usage', async () => {
    const result = await clearHistory();

    expect(result.sessions).toEqual([]);
    expect(result.screenUsage.Home).toBe(0);
  });

  it('summarizes app usage and total screen time', () => {
    const screenUsage = {
      Home: 1800,
      History: 900,
      Insights: 2400,
      Settings: 300,
    };

    expect(getScreenTimeTotal(screenUsage)).toBe(5400);
    expect(getAppUsageBreakdown(screenUsage)[0]).toEqual({ name: 'Insights', minutes: 40 });
    expect(getAppUsageBreakdown(screenUsage)[1]).toEqual({ name: 'Home', minutes: 30 });
  });

  it('normalizes device-wide app usage from native usage stats and excludes own app/system entries', () => {
    const entries = [
      { name: 'Instagram', packageName: 'com.instagram.android', totalMs: 45 * 60 * 1000, icon: 'data:image/png;base64,instagram' },
      { name: 'Chrome', packageName: 'com.android.chrome', totalMs: 18 * 60 * 1000, icon: 'data:image/png;base64,chrome' },
      { name: 'com.google.android.youtube', packageName: 'com.google.android.youtube', totalMs: 30 * 60 * 1000, icon: 'data:image/png;base64,youtube' },
      { name: 'com.google.android.youtube', packageName: 'com.google.android.youtube', totalMs: 15 * 60 * 1000, icon: 'data:image/png;base64,youtube2' },
      { name: 'FocusApp', packageName: 'com.focusapp', totalMs: 6 * 60 * 1000 },
      { name: 'System UI', packageName: 'com.android.systemui', totalMs: 72 * 60 * 1000 },
      { name: 'Tiny app', packageName: 'com.tiny.app', totalMs: 20 * 1000 },
    ];

    expect(normalizeAppUsageEntries(entries)).toEqual([
      { name: 'Instagram', packageName: 'com.instagram.android', minutes: 45, icon: 'data:image/png;base64,instagram' },
      { name: 'YouTube', packageName: 'com.google.android.youtube', minutes: 45, icon: 'data:image/png;base64,youtube' },
      { name: 'Chrome', packageName: 'com.android.chrome', minutes: 18, icon: 'data:image/png;base64,chrome' },
    ]);
  });

  it('uses the correct cycle length for focus and break phases', () => {
    expect(getCycleMinutes({ phase: 'focus', focusMinutes: 25, breakMinutes: 5 })).toBe(25);
    expect(getCycleMinutes({ phase: 'break', focusMinutes: 25, breakMinutes: 10 })).toBe(10);
  });

  it('stores focus and break timing metadata for each session', () => {
    const session = startSession({ mode: 'Normal', plannedMinutes: 25, phase: 'focus', breakMinutes: 5 });

    expect(session.phase).toBe('focus');
    expect(session.breakMinutes).toBe(5);
    expect(session.actualMinutes).toBeUndefined();
  });

  it('keeps a custom emergency pin numeric and limited to four digits', () => {
    expect(sanitizeEmergencyCode('12a34')).toBe('1234');
    expect(sanitizeEmergencyCode('abc')).toBe('');
    expect(sanitizeEmergencyCode('12345')).toBe('1234');
  });

  it('keeps history sorted newest-first and prevents duplicate session ids', async () => {
    const first = { ...startSession({ mode: 'Normal', plannedMinutes: 25 }), id: 'older', startedAt: '2024-01-01T00:00:00.000Z' } as any;
    const second = { ...startSession({ mode: 'Normal', plannedMinutes: 25 }), id: 'newer', startedAt: '2024-01-02T00:00:00.000Z' } as any;

    await saveSession(first);
    await saveSession(second);
    await saveSession(second);

    const sessions = await getSessions();
    expect(sessions.map((entry) => entry.id)).toEqual(['newer', 'older']);
  });

  it('publishes settings changes to listeners immediately', async () => {
    const seen: number[] = [];
    const unsubscribe = subscribeToSettings((settings) => seen.push(settings.focusMinutes));

    await saveSettings({ focusMinutes: 40, defaultMinutes: 40 });

    unsubscribe();
    expect(seen).toContain(40);
  });
});
