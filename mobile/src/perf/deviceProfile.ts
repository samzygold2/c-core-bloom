import { useState, useEffect } from "react";

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

interface BatteryManagerLike {
  charging: boolean;
  level: number;
}

interface NavigatorWithCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: NetworkInformationLike;
  getBattery?: () => Promise<BatteryManagerLike>;
}

export type DeviceTier = "LOW" | "MID" | "HIGH";

export interface DeviceProfile {
  tier: DeviceTier;
  cores: number;
  memoryGB: number | null;
  saveData: boolean;
  effectiveType: string;
  prefersReducedMotion: boolean;
  isBatteryLow: boolean;
  framePerformanceDowngraded: boolean;
}

let cachedProfile: DeviceProfile | null = null;
let pendingProfile: Promise<DeviceProfile> | null = null;
const listeners = new Set<(profile: DeviceProfile) => void>();

/**
 * Benchmark frame rendering on startup
 */
const benchmarkFramePerformance = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      resolve(false);
      return;
    }

    let frames = 0;
    const startTime = performance.now();
    const duration = 800; // Sample for 800ms

    const checkFrame = (now: number) => {
      frames++;
      if (now - startTime < duration) {
        requestAnimationFrame(checkFrame);
      } else {
        const elapsed = now - startTime;
        const fps = (frames / elapsed) * 1000;
        // If device cannot even maintain 35 fps during idle sampling, flag for downgrade
        resolve(fps < 35);
      }
    };

    requestAnimationFrame(checkFrame);
  });
};

/**
 * Classify device tier according to CPU, RAM, network, battery, and frame metrics
 */
const createDeviceProfile = async (): Promise<DeviceProfile> => {

  const nav = (typeof navigator !== "undefined" ? navigator : {}) as unknown as NavigatorWithCapabilities;
  const cores = nav.hardwareConcurrency || 4;
  const memoryGB = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;

  const connection = nav.connection || null;
  const saveData = connection?.saveData === true;
  const effectiveType = connection?.effectiveType || "4g";
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  let isBatteryLow = false;
  if (typeof nav.getBattery === "function") {
    try {
      const battery = await nav.getBattery();
      isBatteryLow = !battery.charging && battery.level <= 0.15;
    } catch {
      // Ignore
    }
  }

  const framePerformanceDowngraded = await benchmarkFramePerformance();

  let tier: DeviceTier = "MID";

  // Tier classification logic per Section 5.2
  if (
    saveData ||
    isBatteryLow ||
    framePerformanceDowngraded ||
    (memoryGB !== null && memoryGB <= 2) ||
    cores <= 4 ||
    effectiveType === "2g" ||
    effectiveType === "slow-2g"
  ) {
    tier = "LOW";
  } else if (memoryGB !== null && memoryGB >= 6 && cores >= 8 && !prefersReducedMotion) {
    tier = "HIGH";
  } else {
    // Default to MID if RAM is unknown (iOS / older WebViews) or in 3-4GB / 6-8 core range
    tier = "MID";
  }

  cachedProfile = {
    tier,
    cores,
    memoryGB,
    saveData,
    effectiveType,
    prefersReducedMotion,
    isBatteryLow,
    framePerformanceDowngraded,
  };

  // Apply tier class to <html> for CSS adaptations
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("tier-low", "tier-mid", "tier-high");
    document.documentElement.classList.add(`tier-${tier.toLowerCase()}`);
  }

  listeners.forEach(listener => listener(cachedProfile as DeviceProfile));
  return cachedProfile;
};

export const detectDeviceProfile = (): Promise<DeviceProfile> => {
  if (cachedProfile) return Promise.resolve(cachedProfile);
  pendingProfile ??= createDeviceProfile();
  return pendingProfile;
};

// Immediate synchronous bootstrap estimation
if (typeof document !== "undefined") {
  const syncNav = (typeof navigator !== "undefined" ? navigator : {}) as unknown as NavigatorWithCapabilities;
  const syncCores = syncNav.hardwareConcurrency || 4;
  const syncMem = typeof syncNav.deviceMemory === "number" ? syncNav.deviceMemory : null;
  const syncSaveData = syncNav.connection?.saveData === true;

  let initialTier: DeviceTier = "MID";
  if (syncSaveData || (syncMem !== null && syncMem <= 2) || syncCores <= 4) {
    initialTier = "LOW";
  } else if (syncMem !== null && syncMem >= 6 && syncCores >= 8) {
    initialTier = "HIGH";
  }

  document.documentElement.classList.add(`tier-${initialTier.toLowerCase()}`);

  // Refine asynchronously
  void detectDeviceProfile();
}

export const getDeviceTier = (): DeviceTier => {
  return cachedProfile?.tier || "MID";
};

export const getDeviceProfile = (): DeviceProfile | null => {
  return cachedProfile;
};

/**
 * React Hook for consuming reactive device tier capabilities
 */
export const useDeviceTier = (): DeviceTier => {
  const [tier, setTier] = useState<DeviceTier>(cachedProfile?.tier || "MID");

  useEffect(() => {
    if (cachedProfile) {
      setTier(cachedProfile.tier);
    }

    const handler = (prof: DeviceProfile) => {
      setTier(prof.tier);
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return tier;
};

/**
 * Performance Budget & Tier Config Settings
 */
export const getTierConfig = (tier: DeviceTier = getDeviceTier()) => {
  switch (tier) {
    case "LOW":
      return {
        debounceMs: 300,
        pageSize: 15,
        maxConcurrentRequests: 2,
        virtualizeThreshold: 15,
        cacheLimitMB: 50,
        animationsEnabled: false,
      };
    case "MID":
      return {
        debounceMs: 200,
        pageSize: 25,
        maxConcurrentRequests: 4,
        virtualizeThreshold: 40,
        cacheLimitMB: 100,
        animationsEnabled: true,
      };
    case "HIGH":
      return {
        debounceMs: 100,
        pageSize: 50,
        maxConcurrentRequests: 6,
        virtualizeThreshold: 80,
        cacheLimitMB: 250,
        animationsEnabled: true,
      };
  }
};
