import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSessions } from '../services/SessionService';

export default function HistoryScreen() {
  const [items, setItems] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      void getSessions().then((sessions) => setItems(sessions));
    }, []),
  );

  return (
    <View style={styles.page}>
      <Text style={styles.title}>History</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No sessions yet.</Text>}
        renderItem={({ item }) => {
          const focusMinutes = item.phase === 'focus' ? item.actualMinutes ?? item.plannedMinutes ?? 0 : 0;
          const breakMinutes = item.phase === 'break' ? item.actualMinutes ?? item.plannedMinutes ?? 0 : Number(item.breakMinutes ?? 0);
          const isComplete = item.status === 'COMPLETED';
          const resultLabel = isComplete ? 'Completed' : item.status === 'FAILED' ? 'Not completed' : item.status === 'STOPPED' ? 'Stopped' : 'Active';

          return (
            <View style={styles.item}>
              <View style={styles.metaWrap}>
                <Text style={styles.name}>{item.mode} · {item.phase === 'break' ? 'Break' : 'Focus'}</Text>
                <Text style={styles.date}>{new Date(item.startedAt).toLocaleString()}</Text>
                <Text style={styles.metaText}>Focus: {focusMinutes} min · Break: {breakMinutes} min</Text>
                <Text style={styles.metaText}>Result: {resultLabel}</Text>
              </View>
              <Text style={[styles.status, item.status === 'FAILED' && styles.fail, !isComplete && item.status !== 'FAILED' && styles.neutral]}>{item.status}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#061A2B',
    padding: 20,
  },
  title: {
    color: '#F5F9FF',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 18,
  },
  empty: {
    color: '#9AB3C7',
    textAlign: 'center',
    marginTop: 24,
  },
  item: {
    backgroundColor: '#0D2437',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E405B',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: '#EAF5FF',
    fontWeight: '700',
  },
  date: {
    color: '#9AB3C7',
    fontSize: 12,
    marginTop: 6,
  },
  status: {
    color: '#7AF7D9',
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  fail: {
    color: '#FF8FA0',
  },
  neutral: {
    color: '#BACDDB',
  },
  metaWrap: {
    flex: 1,
    marginRight: 12,
  },
  metaText: {
    color: '#9AB3C7',
    fontSize: 12,
    marginTop: 4,
  },
});
