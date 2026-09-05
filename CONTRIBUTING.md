# Contributing

Skyglow controls a physical receiver, so changes should preserve the single-receiver handoff, restore aircraft mode after temporary sessions, and keep all private data behind authentication.

1. Create a branch from `main`.
2. Install dependencies with `pnpm install --frozen-lockfile` and `pip install -r requirements-dev.txt`.
3. Run `pnpm check`, `pnpm build`, and `pnpm bundle:check`.
4. Update `wiki/skyglow` when behavior, architecture, setup, operations, or security changes.
5. Open a pull request describing the user-visible result and validation.

Do not commit passwords, private keys, receiver coordinates, radio recordings, database files, session cookies, or tunnel tokens. CI deploys a verified `main` commit; local deployment remains available for recovery.
