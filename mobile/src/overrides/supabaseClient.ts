import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/integrations/supabase/types";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Mobile authentication configuration is missing. Build from the project environment.");
}

interface CapacitorWindow {
  Capacitor?: {
    Plugins?: {
      Preferences?: {
        get: (opts: { key: string }) => Promise<{ value: string | null }>;
        set: (opts: { key: string; value: string }) => Promise<void>;
        remove: (opts: { key: string }) => Promise<void>;
      };
    };
  };
}

/**
 * Mobile-safe persistent storage adapter for Supabase Auth.
 * Bridges native Capacitor Preferences (SharedPreferences on Android / UserDefaults on iOS)
 * with robust local storage fallbacks so authentication sessions survive app backgrounding,
 * kills, and WebView cache clears.
 */
export class MobileStorageAdapter {
  private memoryCache = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    try {
      // Check in-memory cache first
      if (this.memoryCache.has(key)) {
        return this.memoryCache.get(key) || null;
      }

      // Check Capacitor Preferences bridge if available on window
      if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key });
        if (value !== null && value !== undefined) {
          this.memoryCache.set(key, value);
          return value;
        }
      }

      // Fallback to localStorage
      const value = localStorage.getItem(key);
      if (value !== null) {
        this.memoryCache.set(key, value);
      }
      return value;
    } catch (err) {
      console.warn("[MobileStorageAdapter] Failed to getItem:", err);
      try { return localStorage.getItem(key); } catch { return this.memoryCache.get(key) ?? null; }
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      this.memoryCache.set(key, value);
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value });
      }
    } catch (err) {
      console.warn("[MobileStorageAdapter] Failed to setItem:", err);
    }
    try { localStorage.setItem(key, value); } catch { /* Native storage and memory remain available. */ }
  }

  async removeItem(key: string): Promise<void> {
    try {
      this.memoryCache.delete(key);
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key });
      }
    } catch (err) {
      console.warn("[MobileStorageAdapter] Failed to removeItem:", err);
    }
    try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  }
}

export const mobileAuthStorage = new MobileStorageAdapter();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: mobileAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
