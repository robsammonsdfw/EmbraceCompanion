// ============================================================================
// Camera pulse check: the back camera with the torch on, reporting the average
// colour of the middle of each frame (react-native-vision-camera).
//
//   <PulseCamera active torch onSample={(s) => …} onError={(m) => …} style={…} />
//
// About 30 samples a second, each { t, red, green, blue }: the mean of the
// centre 80×80 pixels (0–255), with t in milliseconds. The Run module does the
// pulse maths. Frames are read in memory and dropped at once: no photo or
// video is saved or sent anywhere. Ask for the camera first with
// <PermissionCard kind="camera" />.
// ============================================================================

import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Camera, useCameraDevice, useFrameOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

export type PulseSample = { t: number; red: number; green: number; blue: number };

const SIDE = 80;

export function PulseCamera({
  active,
  torch,
  onSample,
  onError,
  style,
}: {
  active: boolean;
  torch?: boolean;
  onSample: (s: PulseSample) => void;
  onError?: (message: string) => void;
  style?: ViewStyle;
}) {
  const device = useCameraDevice('back');

  // The worklet can't call React directly; it hands each sample to the JS thread.
  const deliver = useMemo(() => (red: number, green: number, blue: number) => {
    onSample({ t: Date.now(), red, green, blue });
  }, [onSample]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: { width: 640, height: 480 },
    onFrame(frame: Frame) {
      'worklet';
      try {
        if (!frame.isValid || !frame.hasPixelBuffer) return;
        const bytes = new Uint8Array(frame.getPixelBuffer());
        const stride = frame.bytesPerRow;
        const fmt = frame.pixelFormat as string;
        // 4 bytes per pixel for BGRA/RGBA, 3 for packed RGB.
        const step = fmt === 'rgb-rgb-8-bit' ? 3 : 4;
        const bgra = fmt === 'rgb-bgra-8-bit';
        const side = Math.min(SIDE, frame.width, frame.height);
        const x0 = Math.floor((frame.width - side) / 2);
        const y0 = Math.floor((frame.height - side) / 2);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = y0; y < y0 + side; y++) {
          let i = y * stride + x0 * step;
          for (let x = 0; x < side; x++, i += step) {
            if (bgra) { b += bytes[i]; g += bytes[i + 1]; r += bytes[i + 2]; }
            else { r += bytes[i]; g += bytes[i + 1]; b += bytes[i + 2]; }
          }
        }
        const n = side * side;
        if (n > 0) scheduleOnRN(deliver, r / n, g / n, b / n);
      } finally {
        frame.dispose();
      }
    },
  });

  if (!device) {
    return <View style={[styles.box, style]} />;
  }

  return (
    <View style={[styles.box, style]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        outputs={[frameOutput]}
        torchMode={active && torch && device.hasTorch ? 'on' : 'off'}
        // Don't stop the member's music while the camera runs.
        allowBackgroundAudioPlayback
        onError={(e) => onError?.(e.message || 'The camera stopped.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: 20, backgroundColor: '#000', minHeight: 120 },
});
