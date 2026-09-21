import { DeviceEventEmitter, NativeModules } from 'react-native';

const module = NativeModules?.ForegroundWatcher || {
  startMonitoring: () => undefined,
  stopMonitoring: () => undefined,
  isMonitoring: () => Promise.resolve(false),
};

export const ForegroundWatcher = {
  startMonitoring: () => {
    if (typeof module?.startMonitoring === 'function') return module.startMonitoring();
    return undefined;
  },
  stopMonitoring: () => {
    if (typeof module?.stopMonitoring === 'function') return module.stopMonitoring();
    return undefined;
  },
  isMonitoring: () => {
    if (typeof module?.isMonitoring === 'function') return module.isMonitoring();
    return Promise.resolve(false);
  },
  addListener: (callback: (event: any) => void) => {
    if (!DeviceEventEmitter || typeof DeviceEventEmitter.addListener !== 'function') {
      return () => undefined;
    }

    const sub = DeviceEventEmitter.addListener('foregroundChanged', callback);
    return () => {
      if (sub && typeof sub.remove === 'function') sub.remove();
    };
  },
};