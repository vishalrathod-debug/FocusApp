import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  clearHistory,
  clampMinutes,
  getSettings,
  sanitizeEmergencyCode,
  saveSettings,
  subscribeToSettings,
  type Settings,
} from '../services/SessionService';

type SettingsState = Settings & { defaultMinutes: number };

export default function SettingsScreen() {
  const [settings, setSettings] = useState<SettingsState>({
    hardFocus: false,
    strictFocus: false,
    penaltyMinutes: 5,
    defaultMinutes: 25,
    focusMinutes: 25,
    breakMinutes: 5,
    emergencyCode: '1234',
  });

  useEffect(() => {
    const syncSettings = async () => {
      const stored = await getSettings();
      setSettings((current) => ({
        ...current,
        ...stored,
        focusMinutes: clampMinutes(stored.focusMinutes ?? stored.defaultMinutes ?? current.focusMinutes, 15, 120),
        breakMinutes: clampMinutes(stored.breakMinutes ?? current.breakMinutes, 5, 30),
        defaultMinutes: clampMinutes(stored.defaultMinutes ?? stored.focusMinutes ?? current.defaultMinutes, 15, 120),
        emergencyCode: sanitizeEmergencyCode(stored.emergencyCode ?? current.emergencyCode),
      }));
    };

    void syncSettings();

    const unsubscribe = subscribeToSettings((latest) => {
      setSettings((current) => ({
        ...current,
        ...latest,
        focusMinutes: clampMinutes(latest.focusMinutes ?? latest.defaultMinutes ?? current.focusMinutes, 15, 120),
        breakMinutes: clampMinutes(latest.breakMinutes ?? current.breakMinutes, 5, 30),
        defaultMinutes: clampMinutes(latest.defaultMinutes ?? latest.focusMinutes ?? current.defaultMinutes, 15, 120),
        emergencyCode: sanitizeEmergencyCode(latest.emergencyCode ?? current.emergencyCode),
      }));
    });

    return () => unsubscribe();
  }, []);

  const updateSettings = async (next: Partial<Settings>) => {
    const updated = await saveSettings(next);
    setSettings((current) => ({
      ...current,
      ...updated,
      focusMinutes: clampMinutes(updated.focusMinutes ?? current.focusMinutes, 15, 120),
      defaultMinutes: clampMinutes(updated.defaultMinutes ?? updated.focusMinutes ?? current.defaultMinutes, 15, 120),
      breakMinutes: clampMinutes(updated.breakMinutes ?? current.breakMinutes, 5, 30),
      emergencyCode: sanitizeEmergencyCode(updated.emergencyCode ?? current.emergencyCode) || '1234',
    }));
  };

  const handleEmergencyCodeChange = async (value: string) => {
    const cleaned = sanitizeEmergencyCode(value);
    const nextCode = cleaned.slice(0, 4);

    setSettings((current) => ({
      ...current,
      emergencyCode: nextCode,
    }));

    if (nextCode.length === 4) {
      await updateSettings({ emergencyCode: nextCode });
    }
  };

  const updateDuration = async (key: 'focusMinutes' | 'breakMinutes', step: number) => {
    const min = key === 'focusMinutes' ? 15 : 5;
    const max = key === 'focusMinutes' ? 120 : 30;
    const current = key === 'focusMinutes' ? settings.focusMinutes : settings.breakMinutes;
    const next = clampMinutes(current + step, min, max);

    if (key === 'focusMinutes') {
      await updateSettings({ focusMinutes: next, defaultMinutes: next });
      return;
    }

    await updateSettings({ breakMinutes: next });
  };

  const handleClearHistory = async () => {
    Alert.alert(
      'Delete history?',
      'This will remove all focus sessions and app usage data from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            Alert.alert('History cleared', 'Your focus history and screen stats were removed.');
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.section}>Timing</Text>

        <View style={styles.timingRow}>
          <Text style={styles.label}>Focus time</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepButton} onPress={() => void updateDuration('focusMinutes', -5)}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={styles.durationText}>{settings.focusMinutes} min</Text>
            <Pressable style={styles.stepButton} onPress={() => void updateDuration('focusMinutes', 5)}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.hint}>Limit: 15–120 minutes</Text>

        <View style={styles.timingRow}>
          <Text style={styles.label}>Break time</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepButton} onPress={() => void updateDuration('breakMinutes', -5)}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={styles.durationText}>{settings.breakMinutes} min</Text>
            <Pressable style={styles.stepButton} onPress={() => void updateDuration('breakMinutes', 5)}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.hint}>Limit: 5–30 minutes</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Hard Focus</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enable hard focus</Text>
          <Switch
            value={settings.hardFocus}
            onValueChange={(value) => updateSettings({ hardFocus: value })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Strict mode</Text>
          <Switch
            value={settings.strictFocus}
            onValueChange={(value) => updateSettings({ strictFocus: value })}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Emergency code</Text>
        <Text style={styles.label}>Set a 4-digit unlock code</Text>
        <TextInput
          style={styles.codeInput}
          value={settings.emergencyCode}
          onChangeText={(value) => void handleEmergencyCodeChange(value)}
          placeholder="1234"
          placeholderTextColor="#89A9BD"
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Penalty</Text>
        <Text style={styles.label}>Penalty minutes: {settings.penaltyMinutes}</Text>
      </View>

      <Pressable style={styles.deleteButton} onPress={() => void handleClearHistory()}>
        <Text style={styles.deleteText}>Delete history</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#061A2B',
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  title: {
    color: '#F5F9FF',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#0D2437',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E405B',
  },
  section: {
    color: '#7AF7D9',
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1C2D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#214A65',
    paddingHorizontal: 8,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#123A4B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    color: '#EAF5FF',
    fontSize: 18,
    fontWeight: '800',
  },
  durationText: {
    color: '#EAF5FF',
    fontWeight: '800',
    minWidth: 72,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  hint: {
    color: '#9AB3C7',
    marginTop: 6,
    fontSize: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 10,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0B1C2D',
    borderWidth: 1,
    borderColor: '#234A65',
    color: '#EAF5FF',
    fontWeight: '700',
  },
  optionActive: {
    backgroundColor: '#123A4B',
    borderColor: '#7AF7D9',
    color: '#7AF7D9',
  },
  label: {
    color: '#EAF5FF',
    fontWeight: '700',
  },
  value: {
    color: '#9AB3C7',
    marginTop: 6,
  },
  codeInput: {
    marginTop: 12,
    backgroundColor: '#071B2C',
    color: '#F5F9FF',
    borderWidth: 1,
    borderColor: '#3A617F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    letterSpacing: 6,
  },
  deleteButton: {
    marginTop: 18,
    backgroundColor: '#7A1F39',
    borderWidth: 1,
    borderColor: '#FF7B98',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: {
    color: '#FFF5F7',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
