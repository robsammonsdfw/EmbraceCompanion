// Signs the member in from a link's one-time code (h=), whichever screen the
// link opens. If someone else is signed in, asks before switching.

import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { exchangeCode } from './auth';

const tried = new Set<string>();

const codeIn = (url: string | null): string | null => {
  if (!url) return null;
  const h = Linking.parse(url).queryParams?.h;
  const code = Array.isArray(h) ? h[0] : h;
  return typeof code === 'string' && code.length >= 32 ? code : null;
};

const confirmSwitch = (name: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(`Switch to ${name}?`, 'This link is for a different EmbraceHealthAI account than the one signed in here.', [
      { text: 'Keep current', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Switch', onPress: () => resolve(true) },
    ]),
  );

/** 'working' while a code is being traded; a message if it couldn't be. */
export const useLinkSignIn = () => {
  const url = Linking.useLinkingURL();
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const code = codeIn(url);
    if (!code || tried.has(code)) return;
    tried.add(code);
    setWorking(true);
    setProblem(null);
    exchangeCode(code)
      .then(async (r) => {
        if (r.isSwitch && !(await confirmSwitch(r.member.firstName || r.member.email))) {
          await r.decline();
          return;
        }
        await r.accept();
      })
      .catch(() => setProblem('That link has expired. Sign in below, or open the Companion from EmbraceHealthAI again.'))
      .finally(() => setWorking(false));
  }, [url]);

  return { working, problem };
};
