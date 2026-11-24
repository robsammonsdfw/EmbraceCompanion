// ============================================================================
// A hidden web page that runs drawing code for a module.
//
// iStride's share designs are drawn with the browser's canvas, the same code
// on the web and here, so a card made in the Companion looks exactly like one
// made in iStride. This runs that code out of sight and hands back what it
// made.
//
//   const host = useRef<DrawingHostHandle>(null);
//   <DrawingHost ref={host} script={drawingCode} onReady={…} onError={…} />
//   const png = await host.current.ask({ design: 'runcam', numbers: … });
//
// The script must set one function:
//   window.companionHandle = (message) => answer        // or a Promise of one
// `message` and `answer` are anything JSON can carry. A picture travels as
// base64 text (canvas.toDataURL), which the module writes to a file.
//
// The page has no address and loads nothing from the internet. It is one
// pixel, see-through and can't be touched.
// ============================================================================

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type DrawingHostHandle = {
  /** Sends one message to the script and resolves with its answer. */
  ask: <T = unknown>(message: unknown, timeoutMs?: number) => Promise<T>;
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>
(function () {
  var post = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  var say = function (e) { return String((e && e.message) || e); };
  window.addEventListener('error', function (e) { post({ kind: 'error', error: say(e.error || e.message) }); });
  var onMessage = function (event) {
    var m;
    try { m = JSON.parse(event.data); } catch (e) { return; }
    if (!m || m.kind !== 'ask') return;
    Promise.resolve()
      .then(function () {
        if (typeof window.companionHandle !== 'function') throw new Error('The drawing code did not set window.companionHandle.');
        return window.companionHandle(m.body);
      })
      .then(function (answer) { post({ kind: 'answer', id: m.id, answer: answer }); })
      .catch(function (e) { post({ kind: 'answer', id: m.id, error: say(e) }); });
  };
  // iPhone delivers to window, Android to document.
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
})();
</script></body></html>`;

type Waiting = { resolve: (answer: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export function DrawingHost({
  ref,
  script,
  onReady,
  onError,
}: {
  ref?: Ref<DrawingHostHandle>;
  /** JavaScript that sets window.companionHandle. Loaded once; change it by remounting with a new `key`. */
  script: string;
  onReady?: () => void;
  onError?: (message: string) => void;
}) {
  // <object>: the package's own typing turns every prop into `never` without it.
  const web = useRef<WebView<object>>(null);
  const waiting = useRef(new Map<number, Waiting>());
  const nextId = useRef(1);
  const ready = useRef(false);

  // Nothing is left waiting when the host goes away.
  useEffect(() => {
    const open = waiting.current;
    return () => {
      for (const w of open.values()) { clearTimeout(w.timer); w.reject(new Error('The drawing page closed.')); }
      open.clear();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    ask: <T,>(message: unknown, timeoutMs = 20000) =>
      new Promise<T>((resolve, reject) => {
        if (!ready.current || !web.current) { reject(new Error('The drawing page isn’t ready yet.')); return; }
        const id = nextId.current++;
        const timer = setTimeout(() => {
          waiting.current.delete(id);
          reject(new Error('The drawing page took too long.'));
        }, timeoutMs);
        waiting.current.set(id, { resolve: (answer) => resolve(answer as T), reject, timer });
        web.current.postMessage(JSON.stringify({ kind: 'ask', id, body: message }));
      }),
  }), []);

  const onMessage = (event: WebViewMessageEvent) => {
    let m: { kind?: string; id?: number; answer?: unknown; error?: string };
    try { m = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (m.kind === 'ready') { ready.current = true; onReady?.(); return; }
    if (m.kind === 'error') { onError?.(m.error || 'The drawing code failed.'); return; }
    if (m.kind !== 'answer' || m.id == null) return;
    const w = waiting.current.get(m.id);
    if (!w) return;
    waiting.current.delete(m.id);
    clearTimeout(w.timer);
    if (m.error) w.reject(new Error(m.error)); else w.resolve(m.answer);
  };

  return (
    <WebView<object>
      ref={web}
      style={styles.hidden}
      containerStyle={styles.hidden}
      pointerEvents="none"
      originWhitelist={['*']}
      source={{ html: PAGE }}
      javaScriptEnabled
      cacheEnabled={false}
      incognito
      setSupportMultipleWindows={false}
      // The page never goes anywhere else.
      onShouldStartLoadWithRequest={(request) => request.url.startsWith('about:') || request.url.startsWith('data:')}
      // The module's code goes in after the page is up, so nothing in it can break the page's own HTML.
      onLoadEnd={() => web.current?.injectJavaScript(`${script}\n;window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'ready' }));true;`)}
      onMessage={onMessage}
      onError={(e) => onError?.(e.nativeEvent.description || 'The drawing page didn’t load.')}
    />
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0 },
});
