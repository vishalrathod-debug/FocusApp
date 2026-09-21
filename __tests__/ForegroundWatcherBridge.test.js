jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    addListener: jest.fn((eventName, callback) => ({
      eventName,
      callback,
      remove: jest.fn(),
    })),
  },
  NativeModules: {},
}));

const { ForegroundWatcher } = require('../src/native/ForegroundWatcherBridge');

describe('ForegroundWatcher bridge', () => {
  it('does not throw when the native module is missing', () => {
    expect(() => ForegroundWatcher.startMonitoring()).not.toThrow();
    expect(() => ForegroundWatcher.stopMonitoring()).not.toThrow();
    expect(ForegroundWatcher.isMonitoring()).resolves.toBe(false);
  });

  it('returns a remove function for event subscriptions', () => {
    const remove = ForegroundWatcher.addListener(() => {});
    expect(typeof remove).toBe('function');
    expect(() => remove()).not.toThrow();
  });
});
