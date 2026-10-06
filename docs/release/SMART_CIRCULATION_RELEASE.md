# Smart circulation release — 2026-10-07

## Implemented in source, not yet a deployed release

| Area | Change | Remaining acceptance |
|---|---|---|
| Web circulation | Sidebar entry, `/circulation`, QR camera/manual lookup, due-date selection, good/damaged returns, explicit confirmation | Live frontend deploy; physical webcam/USB scanner test |
| Overdue penalty | Block new requests and issuance based on due timestamp, even before scheduler updates status; allow returns | Staging overdue/return walkthrough; no monetary fines |
| Mobile sessions | Nine-minute warning; ten-minute expiry on idle, resume and cold start; immediate local sign-out, cache clearing | Install new APK; foreground, background, force-close and offline tests |
| Backend sessions | Member tokens expire after ten minutes; only explicit activity renews them, not background reads | Deploy API; old member sessions require login; web admin policy unchanged |
| Push registration | Android channel before permission/token acquisition, bounded retries, phone re-registration, test/status actions | Physical Android with Play services, permission, valid Firebase/EAS configuration |
| Reminder delivery | Due soon (default three days), due today, overdue; one in-app event per reminder; enqueue after transaction commit | Configure API/worker/scheduler and confirm actual phone delivery |
| Push diagnostics | Ticket/receipt status, invalid-device disabling, test rate limit, owner-only diagnostics | New migration and worker/scheduler deploy |

## Local verification

- 63 backend tests / 354 assertions, using isolated SQLite, pass.
- Three pure mobile session-policy tests pass (10-minute boundary, activity renewal, invalid/future timestamps).
- Web and mobile TypeScript checks pass; web production build passes.
- Browser test on an isolated local database: member lookup, copy lookup, due-date confirmation, successful issue, same-member return, successful return. No Railway records changed.
- Physical camera scanning, push delivery and the complete React Native lifecycle require device testing; unit/type checks do not prove them.
- Short-path sync completed; SHA-256 comparison of 36 source/configuration files found no mismatches. Firebase native configuration matches the client JSON; SDK and signing configuration are present. Short-copy TypeScript and installed dependency checks pass. No new APK was built during this verification.
- The deployment fork's `staging` tip matches local HEAD `b3b8e34` before these uncommitted changes. No force-push is needed based on this check; check again if another person pushes.
- Schedule registration was checked with an in-memory cache because local MySQL is stopped. This does not verify the deployed scheduler or queue worker.

## Safe staging activation order

1. Review and commit intended source changes only. Do not commit `.env`, Firebase service-account keys, Google configuration JSON, keystores, `.codex-build`, or local signing credentials. Preserve unrelated local work.
2. Take a staging database backup. Coordinate the API, worker and scheduler rollout: pause worker/scheduler sends while migrating. Apply additive migrations with `php artisan migrate --force` in the new backend release. Never use `migrate:fresh`.
3. The new migration creates `push_delivery_attempts`; previous QR/push migrations must also be present. Do not enable new worker code against an unmigrated database.
4. Deploy/restart API, scheduler and queue worker from the same commit. Confirm `QUEUE_CONNECTION=database`, `EXPO_PUSH_NOTIFICATIONS_ENABLED=true`, and `LIBRARY_DUE_SOON_DAYS=3` on the relevant services. Existing environment values override source defaults.
5. Verify `php artisan schedule:list`: `library:sync-loans` every 15 minutes; `library:push-receipts` every five minutes. Receipts are queried after 15 minutes; attempt metadata is retained for 30 days. Inspect `queue:failed` for failures.
6. Deploy the frontend from the updated branch to Cloudflare Pages with the Railway HTTPS API URL. Check **Circulation desk** appears. A local successful build does not update the public site.
7. Sync original mobile source to `C:\Users\jttra\LibraryApp\App-Dev\mobile`; build from that short physical path using `android\gradlew.bat assembleRelease`. Version 1.0.1 / Android build 2 identifies this update. Preserve the existing signing key so it can update the installed app.
8. Install the new release APK. Confirm Profile shows 1.0.1 / build 2 and it uses the HTTPS staging API without Metro. Do not confuse an old APK left in `outputs/apk/release` with a newly successful build.

## Acceptance checklist

### Hosting settings to verify before pushing

- Railway API, scheduler and worker: deployment fork `jtravilla546512-netizen/App-Dev`, branch `staging`, root `/backend`; preserve each service's distinct start command. API pre-deploy runs `php artisan migrate --force`, not database reset or demo seeding.
- Cloudflare Pages: same fork and `staging` production branch; root `frontend`, build command `npm run build`, output `dist`; production build variable `VITE_API_BASE_URL=https://astonishing-light-staging.up.railway.app/api/v1`.
- Backend CORS must permit `https://rcjk-library-admin.pages.dev`. Existing variables and secrets must be preserved. These are required settings, not a claim that this local verification changed or inspected the live dashboards.
- Commit intended source/tests/docs only, then `git push deployment HEAD:staging`. Review untracked files explicitly; do not use `git add .` with unrelated presentations/recovery files present.

### Device and live acceptance

- [ ] Member QR from Profile and printed/manual member ID both look up the correct member.
- [ ] Copy QR and accession number identify an individual physical copy; scan alone makes no transaction.
- [ ] Camera denied/unavailable leaves manual entry usable.
- [ ] Borrow selects a due date, confirms identity/copy, and updates availability and member loans.
- [ ] Wrong-member, stale-copy, duplicate submission and damaged-return cases behave safely.
- [ ] Overdue member cannot submit requests, get desk loans, or bypass the restriction via old approval UI; all overdue returns restore eligibility.
- [ ] Reminders appear in the in-app inbox and push works on a real phone; denial/offline leaves borrowing usable.
- [ ] Notifications → Register/retry → Send test → Check delivery status. `accepted` means Expo accepted the ticket; `provider_accepted` means FCM/APNs accepted it, not guaranteed phone display. Check the phone itself.
- [ ] Idle warning at nine minutes; login required at ten minutes in foreground, background and after force-closing/relaunching. Opening the app is not automatically a new session. New login gets a new token.
- [ ] Background refresh does not keep a member token alive. Offline logout clears protected screens and cached account data.
- [ ] Signing out and signing in as another member does not show previous member data or receive their reminders.

## Emerging technology scope

The concrete additions are QR-assisted circulation using browser camera recognition and Expo/FCM push reminders. They complement the existing Laravel/React/React Native system; they are not AI features. Provider setup and physical-device delivery cannot be certified solely from source code.
