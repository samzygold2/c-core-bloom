# Architecture rules

- Keep existing Drive visibility tied to both the active CBT account ID and Firebase Google ID; discard unowned or expired browser sessions so account switches cannot inherit another connection. Google OAuth remains the file authorization boundary.

- Keep mobile-specific integrations inside `mobile/` while reusing shared dashboard implementations so web and phone features stay aligned.
- Resolve exact mobile overrides before the generic source alias and load the managed environment from the project root so native builds use the correct authentication service.
- Register native capabilities through Capacitor plugin imports, not legacy global bridges, so platform synchronization discovers the required plugins.
- Mobile regression tests run with `bun test` through the mobile package test command; validate behavior and actual alias resolution rather than export text alone.