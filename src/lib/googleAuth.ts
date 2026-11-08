import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { supabase } from '@/integrations/supabase/client';
import { ownsDriveConnection, type DriveConnection } from './driveConnection';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();

// Add Drive scopes as configured
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');

// Cache the access token in memory.
let cachedAccessToken: string | null = null;
let isSigningIn = false;
const connectionKey = 'google_drive_connection';
export const DRIVE_CONNECTION_CHANGED = 'google-drive-connection-changed';

function readConnection(): DriveConnection | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(connectionKey) || 'null');
    return parsed && typeof parsed.ownerId === 'string' && typeof parsed.googleId === 'string' &&
      typeof parsed.expiresAt === 'number' ? parsed : null;
  } catch { return null; }
}

export function clearGoogleDriveConnection() {
  cachedAccessToken = null;
  sessionStorage.removeItem('google_drive_token');
  sessionStorage.removeItem(connectionKey);
  window.dispatchEvent(new Event(DRIVE_CONNECTION_CHANGED));
}

supabase.auth.onAuthStateChange((_event, session) => {
  const connection = readConnection();
  if (!session?.user || (connection && connection.ownerId !== session.user.id)) {
    clearGoogleDriveConnection();
  }
});

// Initialize auth state listener. Call this on app load.
export const initGoogleAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    const token = await getAccessToken();
    if (user && token) onAuthSuccess?.(user, token);
    else if (!isSigningIn) onAuthFailure?.();
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: FirebaseUser; accessToken: string } | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Sign in to your CBT account first.');
    const ownerId = session.user.id;
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.id !== ownerId) {
      throw new Error('Your CBT account changed. Please connect again.');
    }
    cachedAccessToken = credential.accessToken;
    // Store token in session storage or cache
    sessionStorage.setItem('google_drive_token', cachedAccessToken);
    sessionStorage.setItem(connectionKey, JSON.stringify({ ownerId, googleId: result.user.uid, expiresAt: Date.now() + 55 * 60 * 1000 }));
    window.dispatchEvent(new Event(DRIVE_CONNECTION_CHANGED));
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  await auth.authStateReady();
  const { data: { session } } = await supabase.auth.getSession();
  if (!ownsDriveConnection(readConnection(), session?.user.id, auth.currentUser?.uid)) {
    if (cachedAccessToken || sessionStorage.getItem('google_drive_token')) clearGoogleDriveConnection();
    return null;
  }
  if (!cachedAccessToken) {
    cachedAccessToken = sessionStorage.getItem('google_drive_token');
  }
  return cachedAccessToken;
};

export const googleSignOut = async () => {
  clearGoogleDriveConnection();
  await auth.signOut();
};
