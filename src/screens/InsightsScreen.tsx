import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { AppUsageStats } from '../native/AppUsageStatsBridge';
import {
  computeInsights,
  getAppUsageBreakdown,
  getDeviceAppUsage,
  getScreenTimeTotal,
  getScreenUsage,
  getSessions,
  isDeviceUsageAccessEnabled,
  type DeviceAppUsageEntry,
  type Session,
} from '../services/SessionService';

const getWeekChartData = (sessions: Session[]) => {
  const today = new Date();
  const points = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (6 - index));

    const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const value = sessions.reduce((sum, session) => {
      const started = new Date(session.startedAt);
      if (started.toDateString() !== date.toDateString()) return sum;
      return sum + (session.actualMinutes ?? session.plannedMinutes ?? 0);
    }, 0);

    return { label, value };
  });

  return points;
};

const buildChartPath = (data: { label: string; value: number }[], width: number, height: number) => {
  if (!data.length) return '';

  const values = data.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  return data
    .map((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 28) - 12;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
};

const buildAreaPath = (data: { label: string; value: number }[], width: number, height: number) => {
  const line = buildChartPath(data, width, height);
  if (!line) return '';
  return `${line} L ${width} ${height} L 0 ${height} Z`;
};

const formatDuration = (minutes: number) => {
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
};

export default function InsightsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState(computeInsights([]));
  const [screenUsage, setScreenUsage] = useState<Record<string, number>>({ Home: 0, History: 0, Insights: 0, Settings: 0 });
  const [deviceAppUsage, setDeviceAppUsage] = useState<DeviceAppUsageEntry[]>([]);
  const [usageAccessEnabled, setUsageAccessEnabled] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([getSessions(), getScreenUsage(), getDeviceAppUsage(), isDeviceUsageAccessEnabled()]).then(
        ([allSessions, usage, deviceUsage, canReadUsage]) => {
          setSessions(allSessions);
          setStats(computeInsights(allSessions));
          setScreenUsage({ Home: 0, History: 0, Insights: 0, Settings: 0, ...usage });
          setDeviceAppUsage(deviceUsage);
          setUsageAccessEnabled(canReadUsage);
        },
      );
    }, []),
  );

  const chartData = useMemo(() => getWeekChartData(sessions), [sessions]);
  const totalMinutes = chartData.reduce((sum, item) => sum + item.value, 0);

  const appUsage = useMemo(() => {
    if (usageAccessEnabled === false) return [];
    if (deviceAppUsage.length > 0) return deviceAppUsage.slice(0, 8);
    if (usageAccessEnabled === true) return [];
    return getAppUsageBreakdown(screenUsage).map((entry) => ({
      ...entry,
      packageName: entry.name,
      icon: undefined,
    })) as DeviceAppUsageEntry[];
  }, [deviceAppUsage, screenUsage, usageAccessEnabled]);

  const screenTimeTotal = useMemo(() => {
    if (usageAccessEnabled === false) return 0;
    if (deviceAppUsage.length > 0) {
      return deviceAppUsage.reduce((sum, item) => sum + item.minutes, 0);
    }
    if (usageAccessEnabled === true) return 0;
    return getScreenTimeTotal(screenUsage) / 60;
  }, [deviceAppUsage, screenUsage, usageAccessEnabled]);

  const topScreen = useMemo(() => {
    if (deviceAppUsage.length > 0) {
      const top = deviceAppUsage[0] ?? { name: 'No data', minutes: 0 };
      return { name: top.name, value: top.minutes };
    }

    const entries = Object.entries(screenUsage).sort(([, valueA], [, valueB]) => valueB - valueA);
    const [name, value] = entries[0] ?? ['No data', 0];
    return { name, value: Math.round(Number(value || 0) / 60) };
  }, [deviceAppUsage, screenUsage]);

  const openUsageAccessSettings = () => {
    AppUsageStats.openUsageAccessSettings();
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Insights</Text>
      <Text style={styles.subtitle}>Your offline focus journey.</Text>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Focus trend</Text>
          <Text style={styles.chartValue}>{totalMinutes} min</Text>
        </View>

        <Svg width="100%" height={180} viewBox="0 0 300 180" style={styles.chart}>
          <Defs>
            <LinearGradient id="focusChart" x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#7AF7D9" stopOpacity="0.95" />
              <Stop offset="0.5" stopColor="#2AC7FF" stopOpacity="0.95" />
              <Stop offset="1" stopColor="#00C2FF" stopOpacity="0.95" />
            </LinearGradient>
            <LinearGradient id="focusArea" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#7AF7D9" stopOpacity="0.32" />
              <Stop offset="1" stopColor="#7AF7D9" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <Path d={buildAreaPath(chartData, 300, 180)} fill="url(#focusArea)" />
          <Path
            d={buildChartPath(chartData, 300, 180)}
            fill="none"
            stroke="url(#focusChart)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>

        <View style={styles.daysRow}>
          {chartData.map((point) => (
            <Text key={point.label} style={styles.dayLabel}>{point.label}</Text>
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        <StatCard label="Completed" value={`${stats.completed}/${stats.total}`} />
        <StatCard label="Failed" value={`${stats.failed}`} />
        <StatCard label="Streak" value={`${stats.streak}`} />
        <StatCard label="Avg" value={`${stats.averageLength}m`} />
        <StatCard label="Top use" value={`${topScreen.name} ${formatDuration(topScreen.value)}`} />
        <StatCard label="Screen time" value={formatDuration(screenTimeTotal)} />
        <StatCard label="Best hour" value={stats.bestHour} />
      </View>

      <View style={styles.activityCard}>
        <Text style={styles.activityTitle}>App usage</Text>
        {usageAccessEnabled === false ? (
          <View>
            <Text style={styles.emptyState}>Allow Usage Access in Android settings to see all app screen time on this phone.</Text>
            <Pressable style={styles.permissionButton} onPress={openUsageAccessSettings}>
              <Text style={styles.permissionButtonText}>Grant usage access</Text>
            </Pressable>
          </View>
        ) : appUsage.length === 0 ? (
          <Text style={styles.emptyState}>No app usage recorded yet.</Text>
        ) : (
          appUsage.map((entry) => (
            <View key={entry.packageName || entry.name} style={styles.appRow}>
              <View style={styles.appMetaRow}>
                {entry.icon ? (
                  <Image source={{ uri: entry.icon }} style={styles.appIcon} resizeMode="contain" />
                ) : (
                  <View style={styles.appIconPlaceholder}>
                    <Text style={styles.appIconPlaceholderText}>{entry.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.appName}>{entry.name}</Text>
              </View>
              <Text style={styles.appMinutes}>{formatDuration(entry.minutes)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.activityCard}>
        <Text style={styles.activityTitle}>Recent activity</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyState}>No focus sessions yet. Start your first one from Home.</Text>
        ) : (
          sessions.slice(0, 5).map((session) => (
            <View key={session.id} style={styles.activityRow}>
              <View>
                <Text style={styles.activityMode}>{session.mode}</Text>
                <Text style={styles.activityMeta}>{new Date(session.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <View style={styles.badgeWrap}>
                <Text style={[styles.badge, session.status === 'COMPLETED' ? styles.badgeComplete : session.status === 'FAILED' ? styles.badgeFailed : styles.badgeNeutral]}>
                  {session.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#061A2B',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 110,
  },
  title: {
    color: '#F5F9FF',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  subtitle: {
    color: '#9AB3C7',
    marginBottom: 18,
    fontSize: 14,
  },
  chartCard: {
    backgroundColor: 'rgba(12, 34, 53, 0.94)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(122, 247, 217, 0.18)',
    marginBottom: 18,
    shadowColor: '#00C2FF',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartTitle: {
    color: '#E6F3FF',
    fontWeight: '700',
    fontSize: 16,
  },
  chartValue: {
    color: '#7AF7D9',
    fontWeight: '700',
    fontSize: 13,
  },
  chart: {
    height: 180,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dayLabel: {
    color: '#89A8BE',
    fontSize: 10,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: '#0E2437',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E405B',
  },
  label: {
    color: '#9AB3C7',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  value: {
    color: '#EAF5FF',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 8,
  },
  activityCard: {
    backgroundColor: 'rgba(12, 34, 53, 0.94)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(122, 247, 217, 0.18)',
  },
  activityTitle: {
    color: '#F5F9FF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  appRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  appMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#10283B',
  },
  appIconPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#123A4B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconPlaceholderText: {
    color: '#EAF5FF',
    fontWeight: '800',
    fontSize: 14,
  },
  appName: {
    color: '#EAF5FF',
    fontWeight: '700',
    flexShrink: 1,
  },
  appMinutes: {
    color: '#7AF7D9',
    fontWeight: '800',
  },
  emptyState: {
    color: '#9AB3C7',
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 12,
    backgroundColor: '#7AF7D9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#071B2B',
    fontWeight: '800',
    fontSize: 13,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  activityMode: {
    color: '#EAF5FF',
    fontWeight: '700',
    marginBottom: 4,
  },
  activityMeta: {
    color: '#9AB3C7',
    fontSize: 12,
  },
  badgeWrap: {
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    textTransform: 'capitalize',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  badgeComplete: {
    backgroundColor: 'rgba(76, 217, 167, 0.16)',
    color: '#7AF7D9',
  },
  badgeFailed: {
    backgroundColor: 'rgba(255, 96, 121, 0.15)',
    color: '#FF7A8D',
  },
  badgeNeutral: {
    backgroundColor: 'rgba(133, 156, 183, 0.15)',
    color: '#D9E8F3',
  },
});
