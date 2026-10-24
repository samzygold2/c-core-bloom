import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { confirmTestExit, isTestPath, shouldConfirmTestExit } from "./navigation";

const isExamPath = () => isTestPath(window.location.pathname);
let initialized = false;

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

let wakeLockSentinel: WakeLockSentinelLike | null = null;
let lastBackPressTime = 0;
let exitToastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Screen Wake Lock Management
 * Ensures device screen stays awake during CBT exams so candidates are not interrupted.
 */
const requestScreenWakeLock = async () => {
  if (typeof navigator !== "undefined" && "wakeLock" in navigator && isExamPath()) {
    try {
      if (!wakeLockSentinel) {
        const nav = navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinelLike> } };
        wakeLockSentinel = await nav.wakeLock.request("screen");
        wakeLockSentinel.addEventListener("release", () => {
          wakeLockSentinel = null;
        });
      }
    } catch {
      // Screen wake lock request may fail or be rejected by OS battery saver policy
    }
  }
};

const releaseScreenWakeLock = async () => {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // Ignore
    } finally {
      wakeLockSentinel = null;
    }
  }
};

/**
 * Show a lightweight native-style exit warning toast
 */
const showExitToast = (message: string) => {
  const existing = document.getElementById("mobile-exit-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "mobile-exit-toast";
  toast.innerText = message;
  toast.style.position = "fixed";
  toast.style.bottom = "calc(var(--safe-area-bottom, 0px) + 24px)";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.backgroundColor = "hsl(var(--foreground))";
  toast.style.color = "hsl(var(--background))";
  toast.style.padding = "8px 16px";
  toast.style.borderRadius = "20px";
  toast.style.fontSize = "13px";
  toast.style.fontWeight = "500";
  toast.style.zIndex = "99999";
  toast.style.pointerEvents = "none";
  toast.style.transition = "opacity 0.2s ease";

  document.body.appendChild(toast);

  if (exitToastTimer) clearTimeout(exitToastTimer);
  exitToastTimer = setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 2000);
};

/**
 * Safe scroll focused input field into view when the mobile keyboard expands
 */
const safeScrollIntoView = (element: HTMLElement | null) => {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const isBelowViewport = rect.bottom > window.innerHeight - 140;
  const isAboveViewport = rect.top < 120;

  if (isBelowViewport || isAboveViewport) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

/**
 * Close any active modal, sheet, dropdown, or popover
 */
const closeOpenOverlays = (): boolean => {
  const openOverlay = document.querySelector(
    '[role="dialog"], [role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
  );

  if (openOverlay) {
    openOverlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return true;
  }

  return false;
};

/**
 * Android Hardware Back Button Handling
 */
const handleBackButton = () => {
  // 1. Close open dialogs/sheets first
  if (closeOpenOverlays()) {
    return;
  }

  // 3. Double-back-to-exit on root paths
  const rootPaths = ["/", "/dashboard", "/admin", "/auth", "/super-admin"];
  const isRootScreen = rootPaths.includes(window.location.pathname) || window.history.length <= 1;

  if (isRootScreen) {
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      if (Capacitor.isNativePlatform()) {
        void App.exitApp();
      } else if (window.history.length > 1) {
        window.history.back();
      }
    } else {
      lastBackPressTime = now;
      showExitToast("Press back again to exit");
    }
    return;
  }

  // Standard back navigation
  if (window.history.length > 1) {
    window.history.back();
  }
};

/**
 * Handle incoming deep links (e.g. auth callbacks, password reset tokens)
 */
const handleDeepLinkUrl = (urlStr: string) => {
  try {
    const parsed = new URL(urlStr);
    const targetPath = parsed.pathname + parsed.search + parsed.hash;
    if (targetPath && targetPath !== window.location.pathname) {
      window.history.pushState(null, "", targetPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  } catch {
    // URL parsing fallback
  }
};

export const initMobileShell = () => {
  if (initialized) return;
  initialized = true;
  // Setup CSS safe area environment variables
  document.documentElement.style.setProperty("--safe-area-top", "env(safe-area-inset-top, 0px)");
  document.documentElement.style.setProperty("--safe-area-right", "env(safe-area-inset-right, 0px)");
  document.documentElement.style.setProperty("--safe-area-bottom", "env(safe-area-inset-bottom, 0px)");
  document.documentElement.style.setProperty("--safe-area-left", "env(safe-area-inset-left, 0px)");

  // Sync theme-color for system chrome
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.setAttribute("name", "theme-color");
    document.head.appendChild(metaTheme);
  }
  const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (background) metaTheme.setAttribute("content", `hsl(${background})`);

  // Visual viewport height adjustment for on-screen keyboards
  const onResize = () => {
    const vh = window.visualViewport?.height ? `${window.visualViewport.height}px` : "100dvh";
    document.documentElement.style.setProperty("--app-height", vh);
  };

  onResize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 50));
  window.visualViewport?.addEventListener("resize", onResize);

  // Keyboard scroll into view
  document.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target.tagName !== "BODY") {
      setTimeout(() => safeScrollIntoView(target), 100);
    }
  });

  // Manage Screen Wake Lock based on route navigation
  const checkWakeLockState = () => {
    if (isExamPath()) {
      requestScreenWakeLock();
    } else {
      releaseScreenWakeLock();
    }
  };

  // Observe SPA navigation as well as browser/native back. Keep the source URL
  // and history entry so cancel restores the exam rather than the destination.
  let previousUrl = window.location.href;
  let previousState = window.history.state;
  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);
  const watchNavigation = (method: typeof originalPush) =>
    (data: unknown, unused: string, url?: string | URL | null) => {
      const target = new URL(String(url ?? window.location.href), window.location.href);
      if (shouldConfirmTestExit(window.location.pathname, target.pathname) && !confirmTestExit()) return;
      method(data, unused, url);
      previousUrl = window.location.href;
      previousState = window.history.state;
      checkWakeLockState();
    };
  window.history.pushState = watchNavigation(originalPush);
  window.history.replaceState = watchNavigation(originalReplace);
  window.addEventListener("popstate", (event) => {
    if (shouldConfirmTestExit(new URL(previousUrl).pathname, window.location.pathname) && !confirmTestExit()) {
      originalPush(previousState, "", previousUrl);
      event.stopImmediatePropagation();
      return;
    }
    previousUrl = window.location.href;
    previousState = window.history.state;
    checkWakeLockState();
  });
  checkWakeLockState();

  // Physical escape / back button listener
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && event.isTrusted && !document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      handleBackButton();
    }
  });

  // Lifecycle events: App backgrounding & foregrounding
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      document.body.classList.add("app-paused");
    } else {
      document.body.classList.remove("app-paused");
      // Restore wake lock if still on exam page
      if (isExamPath()) {
        requestScreenWakeLock();
      }
    }
  });

  // Deep links handler
  window.addEventListener("hashchange", () => {
    checkWakeLockState();
  });

  // Custom scheme link dispatcher
  (window as unknown as { __handleAppUrl?: (url: string) => void }).__handleAppUrl = handleDeepLinkUrl;
  if (Capacitor.isNativePlatform()) {
    void App.addListener("backButton", handleBackButton);
    void App.addListener("appUrlOpen", ({ url }) => handleDeepLinkUrl(url));
    void App.getLaunchUrl().then((launch) => { if (launch?.url) handleDeepLinkUrl(launch.url); });
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        checkWakeLockState();
        window.dispatchEvent(new Event("focus"));
      } else {
        void releaseScreenWakeLock();
      }
    });
  }
};
