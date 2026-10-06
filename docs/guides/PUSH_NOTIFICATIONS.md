# Android push notifications

## What this feature does

The RCJK Library app keeps its existing in-app notification inbox. Optional
Android push messages are an additional reminder channel for:

- a book checked out or returned;
- a borrow request being reviewed;
- a book due soon or due today; and
- an overdue book.

If permission is denied, the Expo service is unavailable, or the phone is
offline, the library transaction still succeeds and the in-app notification is
still saved. Push notifications never contain a password, email address, or
full borrowing history.

## Member experience

1. Sign in to the Android app.
2. Open **Notifications**.
3. Turn on **Push notifications** and accept Android's permission request.
4. Optionally turn off due-date reminders or library activity alerts.

Signing out attempts to unregister the phone. Offline or expired sessions can
prevent that request, so verify shared-device behavior during acceptance tests.
Register/retry after login associates the phone with the current member.

Use **Register / retry this phone**, **Send test notification**, and **Check
delivery status** to diagnose setup. Android notification permission alone does
not prove that Firebase obtained a token or that the API registered the device.
The app creates the `library-reminders` Android channel before requesting a token.

## Developer and staging setup

1. Run the new Laravel migration before using the API:

   ```powershell
   cd backend
   php artisan migrate
   ```

2. Create/select an Expo project and place its ID in `mobile/.env` before
   building the signed APK:

   ```dotenv
   EXPO_PUBLIC_EAS_PROJECT_ID=your-expo-project-id
   ```

3. Build a new APK. Native notification permissions are included through the
   `expo-notifications` plugin, so an already-installed APK cannot gain this
   feature without being rebuilt.
4. Set the deployed Laravel variables:

   ```dotenv
   QUEUE_CONNECTION=database
   EXPO_PUSH_NOTIFICATIONS_ENABLED=true
   LIBRARY_DUE_SOON_DAYS=3
   ```

5. Run both `php artisan schedule:work` and
   `php artisan queue:work --sleep=3 --tries=3` as separate deployed services.

The Expo Push API and the Android permission flow have no direct per-message
cost for this small project. Hosting the Laravel scheduler and queue worker is
still the deployment provider's responsibility.

## Operational behavior

- `library:sync-loans` runs every 15 minutes.
- The first due-soon alert for each loan is recorded only once.
- The due-today alert is a separate once-only event.
- The first overdue alert for each loan is recorded only once.
- Invalid Expo tokens reported as `DeviceNotRegistered` are disabled
  automatically.
- The app re-registers a previously permitted device after login without
  showing another permission dialog.
- `library:push-receipts` runs every five minutes and checks tickets at least
  15 minutes old. The `push_delivery_attempts` migration must run first.
- `accepted` means Expo accepted the request; `provider_accepted` means FCM/APNs
  accepted it, not proof that the phone displayed it. Verify on the device.
- Delivery attempt metadata is removed after 30 days; no private keys or push
  tokens are exposed by the member diagnostics endpoint.
