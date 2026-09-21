import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';

import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { AppUsageStats } from './src/native/AppUsageStatsBridge';
import { getScreenUsage, isDeviceUsageAccessEnabled, saveScreenUsage } from './src/services/SessionService';

const Tabs = createBottomTabNavigator();
const tabIconMap: Record<string, string> = {
  Home: 'home',
  History: 'history',
  Insights: 'bar-chart',
  Settings: 'settings',
};

function TabIcon({ color, routeName, focused }: { color: string; routeName: string; focused: boolean }) {
  const name = tabIconMap[routeName] ?? 'radio-button-unchecked';
  return (
    <View
      style={{
        width: 38,
        height: 38,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: focused ? 'rgba(122, 247, 217, 0.14)' : 'transparent',
        borderRadius: 12,
        shadowColor: focused ? '#7AF7D9' : 'transparent',
        shadowOpacity: focused ? 0.35 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <Icon name={name} size={24} color={color} />
    </View>
  );
}

export default function App() {
  const previousScreenRef = useRef<string | null>(null);
  const screenStartRef = useRef<number>(Date.now());
  const permissionPromptedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || permissionPromptedRef.current) return;

    permissionPromptedRef.current = true;

    void isDeviceUsageAccessEnabled().then((enabled) => {
      if (enabled) return;

      Alert.alert(
        'Usage access needed',
        'Allow usage access so FocusApp can track real app time and show accurate insights without breaking your focus flow.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => AppUsageStats.openUsageAccessSettings(),
          },
        ],
        { cancelable: false },
      );
    });
  }, []);

  const updateScreenUsage = useCallback(async (screenName: string, secondsSpent: number) => {
    if (!screenName || secondsSpent <= 0) return;
    const currentUsage = await getScreenUsage();
    const nextUsage = { ...currentUsage, [screenName]: (currentUsage[screenName] ?? 0) + secondsSpent };
    await saveScreenUsage(nextUsage);
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.appShell}>
          <Tabs.Navigator
            screenListeners={{
              state: (event: any) => {
                const routeName = event?.data?.state?.routes?.[event.data.state.index]?.name ?? null;
                const now = Date.now();

                if (previousScreenRef.current && routeName && previousScreenRef.current !== routeName) {
                  const secondsSpent = (now - screenStartRef.current) / 1000;
                  void updateScreenUsage(previousScreenRef.current, secondsSpent);
                }

                previousScreenRef.current = routeName;
                screenStartRef.current = now;
              },
            }}
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarShowLabel: false,
              tabBarStyle: {
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 18,
                height: 74,
                borderRadius: 22,
                backgroundColor: 'rgba(9, 21, 33, 0.98)',
                borderTopWidth: 0,
                borderColor: 'rgba(255,255,255,0.05)',
                paddingTop: 8,
                paddingBottom: 8,
                paddingHorizontal: 18,
                elevation: 12,
                shadowColor: '#00C2FF',
                shadowOpacity: 0.15,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
              },
              tabBarActiveTintColor: '#7AF7D9',
              tabBarInactiveTintColor: '#DCEAF7',
              tabBarIcon: ({ color, focused }) => (
                <TabIcon color={focused ? '#7AF7D9' : '#EAF4FF'} routeName={route.name} focused={focused} />
              ),
              tabBarItemStyle: {
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: 0,
                marginHorizontal: 6,
              },
            })}
          >
            <Tabs.Screen name="Home" component={HomeScreen} />
            <Tabs.Screen name="History" component={HistoryScreen} />
            <Tabs.Screen name="Insights" component={InsightsScreen} />
            <Tabs.Screen name="Settings" component={SettingsScreen} />
          </Tabs.Navigator>
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: '#061021',
  },
});
