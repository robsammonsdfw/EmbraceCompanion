// ============================================================================
// Runcam's camera: a live preview that takes a photo or records a short clip
// (react-native-vision-camera, the library the pulse check already uses).
//
//   const cam = useRef<RunCameraHandle>(null);
//   <RunCamera ref={cam} active facing="back" onError={(m) => …}>
//     …anything drawn over the preview (the live numbers)…
//   </RunCamera>
//
//   const path = await cam.current.takePhoto();
//   const clip = await cam.current.startClip({ maxSeconds: 30, onStarted });
//   const clip = await cam.current.stopClip();      // the same clip, sooner
//
// A clip is { path, ended }: 'stopped' (stopClip), 'max' (it reached
// maxSeconds) or 'cut' (the phone interrupted it; what was recorded is kept).
// Paths are plain paths, not "file://" addresses (see media.ts).
//
// Clips have no sound, so the microphone is never used and the member's music
// keeps playing. What is drawn over the preview is NOT in the photo or clip:
// the recorder writes the camera's own picture. Runcam lays the numbers on
// afterwards (media.ts exportClip).
//
// The camera works only while the Companion is on screen. Ask for it first
// with <PermissionCard kind="runcam" />.
// ============================================================================

import { File } from 'expo-file-system';
import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  usePhotoOutput,
  useVideoOutput,
  type Recorder,
} from 'react-native-vision-camera';

import { fileUri } from './media';

export type ClipEnd = 'stopped' | 'max' | 'cut';
export type Clip = { path: string; ended: ClipEnd };

export type RunCameraHandle = {
  /** Takes a JPEG and gives back its path. */
  takePhoto: () => Promise<string>;
  /**
   * Starts a clip. Resolves when the clip has finished, however it finished.
   * onStarted runs once frames are being written, which is the moment to start
   * logging the numbers that go with it.
   */
  startClip: (o: { maxSeconds: number; onStarted?: () => void }) => Promise<Clip>;
  /** Stops the clip being recorded and resolves with it. */
  stopClip: () => Promise<Clip>;
};

const CONSTRAINTS = [{ fps: 30 }];

export function RunCamera({
  ref,
  active,
  facing = 'back',
  onError,
  style,
  children,
}: {
  ref?: Ref<RunCameraHandle>;
  active: boolean;
  facing?: 'back' | 'front';
  onError?: (message: string) => void;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.QHD_16_9, containerFormat: 'jpeg', qualityPrioritization: 'balanced' });
  const videoOutput = useVideoOutput({ targetResolution: CommonResolutions.FHD_16_9, enableAudio: false, fileType: 'mp4' });
  const recording = useRef<{ recorder: Recorder; done: Promise<Clip> } | null>(null);

  useImperativeHandle(ref, () => ({
    takePhoto: async () => (await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {})).filePath,

    startClip: async ({ maxSeconds, onStarted }) => {
      if (recording.current) throw new Error('A clip is already recording.');
      const recorder = await videoOutput.createRecorder({ maxDuration: maxSeconds });
      let finish: (clip: Clip) => void = () => undefined;
      let fail: (error: Error) => void = () => undefined;
      const done = new Promise<Clip>((resolve, reject) => { finish = resolve; fail = reject; });
      const clear = () => { if (recording.current?.recorder === recorder) recording.current = null; };
      recording.current = { recorder, done };
      try {
        await recorder.startRecording(
          (path, reason) => { clear(); finish({ path, ended: reason === 'stopped' ? 'stopped' : 'max' }); },
          (error) => {
            clear();
            // Interrupted (a call, the phone locked, the app closed): keep what was written.
            const path = recorder.filePath;
            let kept = false;
            try { const f = new File(fileUri(path)); kept = f.exists && f.size > 0; } catch { kept = false; }
            if (kept) finish({ path, ended: 'cut' }); else fail(error);
          },
        );
      } catch (e) {
        clear();
        throw e;
      }
      onStarted?.();
      return done;
    },

    stopClip: async () => {
      const current = recording.current;
      if (!current) throw new Error('No clip is recording.');
      // It may already be stopping on its own (the time limit); the clip still arrives.
      await current.recorder.stopRecording().catch(() => undefined);
      return current.done;
    },
  }), [photoOutput, videoOutput]);

  return (
    <View style={[styles.box, style]}>
      {device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={active}
          outputs={[photoOutput, videoOutput]}
          constraints={CONSTRAINTS}
          // Don't stop the member's music while the camera runs.
          allowBackgroundAudioPlayback
          onError={(e) => onError?.(e.message || 'The camera stopped.')}
        />
      ) : null}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#000', minHeight: 120 },
});
