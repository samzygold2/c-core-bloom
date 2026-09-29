# Database Dashboard User Labels

## Goal
Replace raw user ID values in the Super Admin database dashboard with readable usernames or emails.

## Changes
- Load profile identities for user-reference columns shown in supported database tables.
- Display the username when available, otherwise the email, with a safe fallback for missing profiles.
- Make each displayed identity clickable so repeated clicks alternate between username and email.
- Preserve the underlying user ID for database updates, filters, and record integrity.
- Verify the dashboard still builds and user-reference cells behave correctly.

## Technical details
- Detect columns that reference users, including common fields such as `user_id`, `admin_id`, `created_by`, `reviewed_by`, `updated_by`, `processed_by`, `generated_by`, `run_by`, and `started_by`.
- Resolve UUIDs against profile records in one lookup rather than querying per row.
- Keep identity-display state presentation-only; no database schema or stored values will change.
