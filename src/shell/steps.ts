// Steps during an activity. iPhone counts in the motion chip even while the app
// is in the background, so the total is read from the start time. Android only
// counts while watching, so a running total is kept from the watch.
// Ask for permission first with ensureMotion() (permissions.ts).

import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

export type StepCounter = {
  /** Steps since start(). */
  current: () => Promise<number>;
  stop: () => void;
};

export const startSteps = async (since: Date = new Date()): Promise<StepCounter | null> => {
  if (!(await Pedometer.isAvailableAsync().catch(() => false))) return null;
  if (Platform.OS === 'ios') {
    return {
      current: async () => (await Pedometer.getStepCountAsync(since, new Date())).steps,
      stop: () => undefined,
    };
  }
  let total = 0;
  const sub = Pedometer.watchStepCount((r) => { total = r.steps; });
  return { current: async () => total, stop: () => sub.remove() };
};
