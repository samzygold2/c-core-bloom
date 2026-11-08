# Mobile bug check

## Private Google Drive
- [x] Restrict existing Google Drive visibility to the connected account; add Settings registration and reject unowned/expired sessions without replacing sign-in.
- [x] Verify visibility/account-switch rules with regression tests and signed-in navigation in the browser. Google consent remains unverified; connector setup was declined and existing Firebase sign-in is unchanged.

- [x] Build an Android testing APK; verify signatures, package metadata, bundled assets, and plugins; save download. Physical-device execution remains unverified.

- [x] Audit mobile overrides, configuration, and phone test behavior.
- [x] Fix confirmed integration, storage, timer, exit, and layout bugs; add regression checks.
- [x] Exercise signed-in mobile pages and controls; record remaining findings in the mobile bug report.
- [ ] Verify hardware back, native PDF delivery, and native session survival — blocked by unavailable physical device/emulator.
- [ ] Verify rankings using submitted results — blocked because the tested account has no completed results; no live data was seeded.