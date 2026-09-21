import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as TimerGradient, Stop } from 'react-native-svg';
import { ForegroundWatcher } from '../native/ForegroundWatcherBridge';
import {
  finishSession,
  getAdaptiveMinutes,
  getCycleMinutes,
  getSettings,
  saveSession,
  startSession,
  subscribeToSettings,
} from '../services/SessionService';

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const getDynamicGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const [mode, setMode] = useState<'Normal' | 'Adaptive' | 'Hard Focus'>('Normal');
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [active, setActive] = useState<any | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [sessionDuration, setSessionDuration] = useState(25 * 60);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyCode, setEmergencyCode] = useState('');
  const [emergencyError, setEmergencyError] = useState('');
  const settingsRef = useRef({
    hardFocus: false,
    strictFocus: false,
    penaltyMinutes: 5,
    defaultMinutes: 25,
    focusMinutes: 25,
    breakMinutes: 5,
    emergencyCode: '1234',
  });
  const pausedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const refreshSettings = async () => {
    const latest = await getSettings();
    settingsRef.current = latest;
  };

  useEffect(() => {
    void refreshSettings();

    const unsubscribe = subscribeToSettings((latest) => {
      settingsRef.current = latest;

      if (!active) {
        const nextPhaseMinutes = getCycleMinutes({
          phase,
          focusMinutes: latest.focusMinutes ?? latest.defaultMinutes ?? 25,
          breakMinutes: latest.breakMinutes ?? 5,
        });
        setSecondsLeft(nextPhaseMinutes * 60);
        setSessionDuration(nextPhaseMinutes * 60);
      }
    });

    return () => unsubscribe();
  }, [active, phase]);

  useEffect(() => {
    if (!active || paused) return;

    const id = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          Vibration.vibrate([500, 250, 500, 250, 800]);
          Alert.alert(
            phase === 'focus' ? 'Focus session complete' : 'Break complete',
            'Time is up. Tap Stop to acknowledge and continue.',
            [
              {
                text: 'Stop',
                style: 'destructive',
                onPress: async () => {
                  await handleFinish('COMPLETED', 'timer-complete');
                },
              },
            ],
            { cancelable: false },
          );
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [active, paused, phase]);

  const handleFinish = async (status: 'COMPLETED' | 'FAILED' | 'STOPPED', reason?: string) => {
    if (!active) return;

    if (typeof ForegroundWatcher?.stopMonitoring === 'function') {
      ForegroundWatcher.stopMonitoring();
    }

    const sessionWithPause = pausedAtRef.current
      ? { ...active, pausedMs: (active.pausedMs ?? 0) + (Date.now() - pausedAtRef.current) }
      : active;

    const saved = finishSession(sessionWithPause, status, reason);
    await saveSession(saved);
    pausedAtRef.current = null;
    setActive(null);
    setPaused(false);

    if (status === 'COMPLETED' && phase === 'focus') {
      const nextBreakMinutes = getCycleMinutes({ phase: 'break', focusMinutes: settingsRef.current.focusMinutes, breakMinutes: settingsRef.current.breakMinutes });
      setPhase('break');
      setSecondsLeft(nextBreakMinutes * 60);
      setSessionDuration(nextBreakMinutes * 60);
      return;
    }

    if (status === 'COMPLETED' && phase === 'break') {
      const nextFocusMinutes = getCycleMinutes({ phase: 'focus', focusMinutes: settingsRef.current.focusMinutes, breakMinutes: settingsRef.current.breakMinutes });
      setPhase('focus');
      setSecondsLeft(nextFocusMinutes * 60);
      setSessionDuration(nextFocusMinutes * 60);
      return;
    }

    const resetMinutes = getCycleMinutes({ phase: 'focus', focusMinutes: settingsRef.current.focusMinutes, breakMinutes: settingsRef.current.breakMinutes });
    setPhase('focus');
    setSecondsLeft(resetMinutes * 60);
    setSessionDuration(resetMinutes * 60);

    if (status === 'FAILED') {
      Alert.alert('Focus session failed', 'You left the app during an enforced focus session.');
    }
  };

  useEffect(() => {
    const unsubscribe = ForegroundWatcher.addListener((event: { state?: string; packageName?: string }) => {
      if (!active) return;
      void refreshSettings().then(() => {
        if (!settingsRef.current.hardFocus) return;
        if (event.state === 'background') {
          void handleFinish('FAILED', 'app-switched');
        }
      });
    });

    return () => unsubscribe();
  }, [active]);

  const begin = async () => {
    await refreshSettings();

    const nextPhaseMinutes = getCycleMinutes({
      phase,
      focusMinutes: settingsRef.current.focusMinutes ?? settingsRef.current.defaultMinutes ?? 25,
      breakMinutes: settingsRef.current.breakMinutes ?? 5,
    });
    const plannedMinutes = mode === 'Adaptive' && phase === 'focus' ? await getAdaptiveMinutes() : nextPhaseMinutes;
    const session = startSession({
      mode,
      plannedMinutes,
      phase,
      breakMinutes: settingsRef.current.breakMinutes ?? 5,
    });

    pausedAtRef.current = null;
    setActive(session);
    setSessionDuration(plannedMinutes * 60);
    setSecondsLeft(plannedMinutes * 60);
    setPaused(false);

    if (settingsRef.current.hardFocus || mode === 'Hard Focus') {
      if (typeof ForegroundWatcher?.startMonitoring === 'function') {
        ForegroundWatcher.startMonitoring();
      }
    }
  };

  const togglePause = () => {
    if (!active) return;

    if (paused) {
      if (pausedAtRef.current) {
        const resumedAt = Date.now();
        setActive((current: any) =>
          current
            ? { ...current, pausedMs: (current.pausedMs ?? 0) + (resumedAt - pausedAtRef.current!) }
            : current,
        );
        pausedAtRef.current = null;
      }
      setPaused(false);
      return;
    }

    pausedAtRef.current = Date.now();
    setPaused(true);
  };

  const emergencyUnlock = async () => {
    await refreshSettings();
    if (!active || !settingsRef.current.strictFocus) return;
    setEmergencyCode('');
    setEmergencyError('');
    setShowEmergencyModal(true);
  };

  const submitEmergencyUnlock = async () => {
    if (!active) return;

    const expectedCode = settingsRef.current.emergencyCode || '1234';
    if (emergencyCode.trim() === expectedCode) {
      setShowEmergencyModal(false);
      await handleFinish('STOPPED', 'emergency-unlock');
      Alert.alert('Emergency override', 'Session ended safely as a protected override.');
      setEmergencyCode('');
      setEmergencyError('');
      return;
    }

    setEmergencyError('Wrong emergency code. Session remains protected.');
  };

  const modeLabel = useMemo(
    () => (active ? (paused ? 'PAUSED' : 'ACTIVE') : 'READY'),
    [active, paused],
  );

  const dynamicClock = useMemo(
    () => now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    [now],
  );

  const progress = useMemo(() => {
    const total = Math.max(1, sessionDuration);
    return Math.min(Math.max(secondsLeft / total, 0), 1);
  }, [secondsLeft, sessionDuration]);

  const radius = 98;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <LinearGradient
      colors={['#061B2F', '#071D2E', '#071526']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.page}
    >
      <View style={styles.headerRow}>
        <View style={styles.brandWrap}>
          <View style={styles.logo}><Text style={styles.logoText}>F</Text></View>
          <Text style={styles.brand}>FocusApp</Text>
        </View>
        <Text style={styles.clock}>{dynamicClock}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.greeting}>{getDynamicGreeting()},</Text>
        <Text style={styles.title}>Let’s focus.</Text>

        <View style={styles.timerWrap}>
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.timerRing}>
            <Svg width={232} height={232} viewBox="0 0 232 232">
              <Defs>
                <TimerGradient id="timerGradient" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#76F9D9" />
                  <Stop offset="0.5" stopColor="#2AC7FF" />
                  <Stop offset="1" stopColor="#00E4A3" />
                </TimerGradient>
              </Defs>

              <Circle
                cx={116}
                cy={116}
                r={radius}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={10}
                fill="transparent"
              />

              <Circle
                cx={116}
                cy={116}
                r={radius}
                stroke="url(#timerGradient)"
                strokeWidth={10}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 116 116)"
              />
            </Svg>

            <View style={styles.timerCircle}>
              <Text style={styles.timerText}>{formatTime(secondsLeft)}</Text>
              <Text style={styles.timerLabel}>Focus Time</Text>
            </View>
          </Pressable>
        </View>

        {active && (settingsRef.current.hardFocus || mode === 'Hard Focus') ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>Hard Focus enabled — leaving the app will fail this session.</Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {!active ? (
            <Pressable style={styles.primaryButton} onPress={() => void begin()}>
              <Text style={styles.primaryText}>Start focus</Text>
            </Pressable>
          ) : (
            <>
              {phase === 'focus' ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => void handleFinish('COMPLETED', 'manual-break')}
                >
                  <Text style={styles.secondaryText}>Take break</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => void handleFinish('COMPLETED', 'manual-skip-break')}
                >
                  <Text style={styles.secondaryText}>Skip break</Text>
                </Pressable>
              )}

              <Pressable style={styles.secondaryButton} onPress={togglePause}>
                <Text style={styles.secondaryText}>{paused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
              {settingsRef.current.strictFocus ? (
                <Pressable style={[styles.dangerButton, styles.dangerButtonActive]} onPress={emergencyUnlock}>
                  <Text style={[styles.secondaryText, styles.dangerText]}>Emergency</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.dangerButton, styles.dangerButtonActive]} onPress={() => void handleFinish('STOPPED', 'manual-stop')}>
                  <Text style={[styles.secondaryText, styles.dangerText]}>Stop</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        <Text style={styles.statusText}>
          {active
            ? `${phase.toUpperCase()} SESSION • ${modeLabel}${settingsRef.current.strictFocus ? ' • STRICT MODE' : ''}`
            : `Stay focused on one goal at a time. ${phase === 'break' ? 'Break mode is ready.' : 'Focus mode is ready.'}`}
        </Text>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={showEmergencyModal}
        onRequestClose={() => setShowEmergencyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Emergency unlock</Text>
            <Text style={styles.modalText}>This ends the session as a protected override.</Text>
            <TextInput
              style={styles.modalInput}
              value={emergencyCode}
              onChangeText={(value) => {
                setEmergencyCode(value.replace(/\D/g, '').slice(0, 4));
                if (emergencyError) setEmergencyError('');
              }}
              placeholder="Enter 4-digit code"
              placeholderTextColor="#89A9BD"
              keyboardType="numeric"
              secureTextEntry
              autoFocus
              maxLength={4}
            />
            {emergencyError ? <Text style={styles.modalError}>{emergencyError}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => setShowEmergencyModal(false)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => void submitEmergencyUnlock()}>
                <Text style={styles.modalPrimaryText}>Unlock</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 88,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#7AF7D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoText: {
    color: '#071B2B',
    fontWeight: '800',
    fontSize: 18,
  },
  brand: {
    color: '#ECF8FF',
    fontSize: 18,
    fontWeight: '800',
  },
  clock: {
    color: '#A9C4D4',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: 'rgba(11, 27, 41, 0.95)',
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(122, 247, 217, 0.24)',
    shadowColor: '#31D6FF',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  greeting: {
    color: '#CDE2F2',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  title: {
    color: '#F5F9FF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 18,
    fontFamily: 'monospace',
  },
  timerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  timerRing: {
    width: 238,
    height: 238,
    borderRadius: 119,
    backgroundColor: '#061923',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(122, 247, 217, 0.28)',
    shadowColor: '#4AF0C6',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  timerCircle: {
    position: 'absolute',
    width: 188,
    height: 188,
    borderRadius: 94,
    borderWidth: 8,
    borderColor: 'rgba(122, 247, 217, 0.72)',
    backgroundColor: '#071B2C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    color: '#ECF9FF',
    fontSize: 46,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  timerLabel: {
    color: '#9AB3C7',
    fontSize: 14,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#7AF7D9',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#7AF7D9',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#10283B',
    borderWidth: 1,
    borderColor: '#244B65',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: '#B81335',
    borderWidth: 1,
    borderColor: '#FF98AE',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#FF5C7D',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  dangerButtonActive: {
    backgroundColor: '#FF355A',
  },
  primaryText: {
    color: '#071B2B',
    fontWeight: '800',
  },
  secondaryText: {
    color: '#F5F9FF',
    fontWeight: '800',
  },
  dangerText: {
    color: '#FFF1F4',
    letterSpacing: 0.6,
  },
  statusText: {
    color: '#9AB3C7',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  warningBanner: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 141, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  warningText: {
    color: '#FFD5DC',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 8, 15, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0D2437',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#244B65',
    padding: 20,
  },
  modalTitle: {
    color: '#F5F9FF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalText: {
    color: '#CFE5F7',
    fontSize: 14,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#071B2C',
    color: '#F5F9FF',
    borderWidth: 1,
    borderColor: '#3A617F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    letterSpacing: 6,
    marginBottom: 10,
  },
  modalError: {
    color: '#FF98AE',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  modalSecondary: {
    flex: 1,
    backgroundColor: '#10283B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#244B65',
  },
  modalSecondaryText: {
    color: '#EAF5FF',
    fontWeight: '800',
  },
  modalPrimary: {
    flex: 1,
    backgroundColor: '#7AF7D9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: '#071B2B',
    fontWeight: '800',
  },
});
