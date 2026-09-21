import { Linking, NativeModules, Platform } from 'react-native';

const module = NativeModules?.AppUsageStats || {
  isUsageAccessEnabled: () => Promise.resolve(false),
  getAppUsage: () => Promise.resolve([]),
  openUsageAccessSettings: () => undefined,
};

export const AppUsageStats = {
  isUsageAccessEnabled: () => {
    if (typeof module?.isUsageAccessEnabled === 'function') {
      return module.isUsageAccessEnabled();
    }
    return Promise.resolve(false);
  },
  getAppUsage: () => {
    if (typeof module?.getAppUsage === 'function') {
      return module.getAppUsage();
    }
    return Promise.resolve([]);
  },
  openUsageAccessSettings: () => {
    if (typeof module?.openUsageAccessSettings === 'function') {
      return module.openUsageAccessSettings();
    }

    if (Platform.OS === 'android') {
      return Linking.sendIntent('android.settings.USAGE_ACCESS_SETTINGS');
    }

    return undefined;
  },
};
