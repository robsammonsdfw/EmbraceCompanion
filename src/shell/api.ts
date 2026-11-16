// Signed-in calls to the main API and to iStride. A 401 signs the Companion
// out (the session was ended elsewhere) and the sign-in screen shows.

import { currentToken, signOut } from './auth';
import { MAIN_API_URL, RUN_API_URL } from './config';
import { HttpError, request, type RequestInit } from './http';

const signedIn = async <T>(base: string, path: string, init: Omit<RequestInit, 'token'> = {}): Promise<T> => {
  const token = currentToken();
  if (!token) throw new HttpError(401, 'Not signed in', null);
  try {
    return await request<T>(base, path, { ...init, token });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) await signOut({ alreadyEnded: true });
    throw e;
  }
};

export const mainApi = <T>(path: string, init?: Omit<RequestInit, 'token'>) => signedIn<T>(MAIN_API_URL, path, init);

export const istride = <T>(path: string, init?: Omit<RequestInit, 'token'>) => {
  if (!RUN_API_URL) return Promise.reject(new HttpError(0, "iStride's address isn't set in the Companion yet.", null));
  return signedIn<T>(RUN_API_URL, path, init);
};

export { HttpError };
