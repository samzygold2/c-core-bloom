import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DRIVE_CONNECTION_CHANGED, getAccessToken, initGoogleAuth } from '@/lib/googleAuth';

export function useGoogleDriveConnection() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState({ ownerId: '', connected: false, checked: false });
  useEffect(() => {
    let active = true;
    const ownerId = user?.id || '';
    const update = async () => {
      const connected = Boolean(ownerId && await getAccessToken());
      if (active) setState({ ownerId, connected, checked: true });
    };
    const unsubscribe = initGoogleAuth(() => void update(), () => void update());
    window.addEventListener(DRIVE_CONNECTION_CHANGED, update);
    void update();
    // Re-check the short-lived Google token even while the page stays open.
    const interval = window.setInterval(update, 30_000);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(DRIVE_CONNECTION_CHANGED, update);
      window.clearInterval(interval);
    };
  }, [user?.id]);
  const current = state.ownerId === (user?.id || '');
  return { connected: Boolean(user && current && state.connected), loading: authLoading || !current || !state.checked };
}