# C-Core-Bloom JAMB CBT Mobile App

A cross-platform native Android and iOS application built using **Capacitor** and Vite, providing a feature-complete replica of the C-Core-Bloom Computer-Based Testing (CBT) portal.

---

## 1. Architecture: Web Reuse Without Modification

The mobile app lives strictly within the `mobile/` directory and directly consumes the root web source (`../src`) through Vite path aliasing.

- **Web Source Untouched**: Zero files in `src/`, `public/`, or root configs are modified.
- **Shared Backend**: Same Supabase project, database schemas, Row Level Security (RLS) policies, and serverless Edge Functions.
- **Continuous Sync**: Changes made to web pages or components automatically propagate into the mobile app upon the next build.

---

## 2. Getting Started & Development

### Prerequisites
- Node.js 22+
- Android Studio & Android SDK (for native Android builds)
- Xcode (for iOS builds, macOS required)

### Development Workflow
```bash
# Run local mobile preview server
npm --prefix mobile run dev

# Run static TypeScript validation
npm --prefix mobile run typecheck

# Run linter
npm --prefix mobile run lint

# Validate override export parity with web modules
npm --prefix mobile run check-overrides

# Verify that root web app remains untouched
bash mobile/scripts/web-safety-check.sh
```

---

## 3. Production Building & Release

### Build the Web Bundle
```bash
npm --prefix mobile run build
```
This produces an optimized, code-split production distribution in `mobile/dist/`.

### Android Native Release Build
```bash
# Sync web assets to native Android project
npm --prefix mobile run cap:sync

# Build native Android release APK / AAB
cd mobile/android
./gradlew bundleRelease  # Generates signed AAB for Google Play
./gradlew assembleRelease # Generates APK for direct testing
```

---

## 4. How the Override Pattern Works

When a specific web component or utility requires platform-specific behavior (e.g. native share sheet instead of `<a download>`, wall-clock timers, or persistent storage), **do not edit the web file**.

### How to Add a New Override:
1. Create a replacement file in `mobile/src/overrides/` matching the export signatures of the original web module.
2. Register the alias in `mobile/vite.config.ts`:
   ```typescript
   alias: {
     "@/path/to/module": path.resolve(__dirname, "src/overrides/MyOverride.tsx"),
   }
   ```
3. Add the mapping to `mobile/tsconfig.json` `compilerOptions.paths`.
4. Register the module in `mobile/scripts/check-overrides.ts` so CI automatically enforces that exports never drift from the web version.
5. Log the override reason in `mobile/MOBILE_NOTES.md`.

---

## 5. Active Overrides in this Project

1. **`@/integrations/supabase/client` -> `mobile/src/overrides/supabaseClient.ts`**:
   Bridges native Capacitor Preferences with persistent fallbacks so login sessions survive app kills and WebView resets.
2. **`@/components/TestTimer` -> `mobile/src/overrides/TestTimer.tsx`**:
   Computes remaining exam time using wall-clock `Date.now() - startTime` timestamps on every tick and on app foregrounding, preventing timer drift during backgrounding.
3. **`@/lib/pdfGenerator` -> `mobile/src/overrides/pdfGenerator.ts`**:
   Replaces desktop `<a download>` with the Web Share API (`navigator.share` with `File` objects) to export result slips and reports directly to the native share sheet.
Analytics and Database Dashboard use the shared implementations directly, including student performance statistics and Backup & Restore. Compatibility re-export files remain in the overrides directory; they do not replace those dashboards.

The mobile build loads the managed environment from the project root. Install mobile dependencies with `npm install --prefix mobile` before building or syncing. Run `bun run --cwd mobile test` for behavior and alias-resolution regressions.

After pulling changes, rebuild and synchronize from the mobile package (not the separate root Capacitor project):
```bash
git pull
npm install --prefix mobile
npm --prefix mobile run build
npm --prefix mobile run cap:sync
npm --prefix mobile run android:run
```

---

## 6. Security & Store Policies

- **Privacy Policy**: See `mobile/PRIVACY_POLICY.md`
- **Data Safety Declarations**: See `mobile/DATA_SAFETY.md`
- **Feature & Route Parity Matrix**: See `mobile/PARITY.md`
- **Quality Assurance & Bug Report**: See `mobile/BUG_REPORT.md`
- **Deferred Web Improvement Requests**: See `mobile/WEB_CHANGE_REQUESTS.md`
