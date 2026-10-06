# Railway staging deployment

This guide deploys a non-production RCJK Library environment from the `staging` branch. It uses Railway URLs with HTTPS, so purchasing a custom domain is **not** required for testing.

Do not use local XAMPP data, local `.env` files, production user data, or the temporary local Admin password in this environment.

## 1. Publish the current source branch

Run these commands from the repository root. Railway can only deploy commits that are already on GitHub.

```powershell
git push deployment HEAD:staging
```

The `deployment` remote is the deployment fork, `jtravilla546512-netizen/App-Dev`. Confirm it with `git remote -v`. Do not force-push: fetch and review any remote changes if rejected. In GitHub, confirm that the fork's `staging` branch contains the intended commit before continuing. Railway and Cloudflare must both track that branch for automatic deployment.

For the current feature rollout, follow [Smart circulation release](SMART_CIRCULATION_RELEASE.md). The setup below also covers creating a fresh environment; do not recreate the existing database or rerun initial seeding for ordinary updates.

## 2. Create the Railway project and database

1. Sign in at [Railway](https://railway.app/) and link the GitHub account that owns the deployment fork `jtravilla546512-netizen/App-Dev`.
2. Select **New Project** > **Empty Project** and name it `rcjk-library-staging`.
3. Select **+ New** > **Database** > **MySQL**. Keep it private; the API service will use Railway's internal network to reach it.
4. Rename the database service to `MySQL`. The variable references below assume that service name.

## 3. Deploy the Laravel API

1. Select **+ New** > **Empty Service** and name it `api`.
2. In its **Settings**, connect `jtravilla546512-netizen/App-Dev`, choose the `staging` branch, and set **Root Directory** to `/backend`.
3. Set the watch path to `/backend/**` so frontend-only commits do not redeploy the API.
4. Set the **Pre-Deploy Command** below. It is safe only for this fresh staging environment: it runs migrations, creates the controlled first Admin, and adds the repeat-safe 20-book demonstration catalog.

```sh
php artisan migrate --force && php artisan db:seed --force && php artisan db:seed --class=DemoCatalogSeeder --force
```

After the initial setup, use only `php artisan migrate --force` as the API pre-deploy command. Keep worker/scheduler rollout coordinated with migrations; they must not start using new tables before migration succeeds.

5. In **Variables** > **Raw Editor**, add these values. Generate `APP_KEY` locally with `php artisan key:generate --show` from `backend/`, then paste the output into Railway only. Use a new strong staging password for the first Admin; never commit it.

```dotenv
APP_NAME="RCJK Library"
APP_ENV=staging
APP_KEY=replace-with-a-new-generated-key
APP_DEBUG=false
APP_URL=https://temporary.invalid

LOG_CHANNEL=stderr
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_DATABASE=${{MySQL.MYSQLDATABASE}}
DB_USERNAME=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}

SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database
FILESYSTEM_DISK=local
MAIL_MAILER=log

CORS_ALLOWED_ORIGINS=https://temporary.invalid

LIBRARY_DEFAULT_LOAN_DAYS=14
LIBRARY_MAX_ACTIVE_LOANS=3
LIBRARY_DUE_SOON_DAYS=2
LIBRARY_REQUIRE_EMAIL_VERIFICATION=false
LIBRARY_REQUIRE_MEMBER_APPROVAL=false
LIBRARY_FIRST_ADMIN_NAME=RCJK Library Administrator
LIBRARY_FIRST_ADMIN_EMAIL=replace-with-a-staging-only-admin-email
LIBRARY_FIRST_ADMIN_PASSWORD=replace-with-a-strong-staging-password

# Enable only after the Android release APK is configured with the matching
# Expo/EAS project ID and the queue-worker service in step 5 is online.
EXPO_PUSH_NOTIFICATIONS_ENABLED=false
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
```

6. Deploy the service. When it succeeds, open **Settings** > **Networking** > **Generate Domain**. Copy the generated URL, for example `https://api-xxxx.up.railway.app`.
7. Replace `APP_URL` with that API URL and redeploy. Confirm this URL returns HTTP 200:

```text
https://your-api-domain.up.railway.app/api/v1/health
```

## 4. Deploy the React Admin web application

The `frontend` project has a production `npm run start` command that serves the Vite build with an SPA fallback. This is needed because the Admin application uses browser routes such as `/books` and `/reports`.

1. Select **+ New** > **Empty Service** and name it `web`.
2. Connect the same repository and `staging` branch.
3. Set **Root Directory** to `/frontend` and its watch path to `/frontend/**`.
4. Set the build command to `npm ci && npm run build` and the start command to `npm run start`.
5. Add this variable, using the actual API domain from step 3:

```dotenv
VITE_API_BASE_URL=https://your-api-domain.up.railway.app/api/v1
```

6. Deploy, then generate a Railway domain for this service, for example `https://web-xxxx.up.railway.app`.
7. Return to the `api` service, set `CORS_ALLOWED_ORIGINS` to the exact web URL, and redeploy the API.

The browser app sends bearer tokens rather than cookies, so no `SANCTUM_STATEFUL_DOMAINS` or shared session-cookie domain is required.

## 5. Run the scheduler and queue worker

The scheduled due-soon/overdue process and Expo push sending run in separate
long-running services. Database notifications remain available in the app even
when push delivery is disabled or a device denies permission.

1. Create another service named `scheduler` from the same repository and `staging` branch.
2. Set **Root Directory** to `/backend`.
3. Set **Custom Start Command** to:

```sh
php artisan schedule:work
```

4. Copy the same non-public Laravel and database variables from the `api` service. It needs the same `APP_KEY` and MySQL references, but it does not need a generated public domain.

5. Create one more service named `queue-worker` from the same repository and branch. Set **Root Directory** to `/backend` and **Custom Start Command** to:

```sh
php artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

6. Copy the same Laravel/database variables to `queue-worker`, including `QUEUE_CONNECTION=database`. It does not need a public domain.

The scheduler checks loans every 15 minutes. The worker delivers queued Expo
messages and retries a failed request up to three times. Restart or redeploy
both services whenever Laravel code or variables change.

### Enable Expo push delivery

1. Create or select an Expo/EAS project for the Android app and copy its
   **Project ID**. This value is an identifier, not a secret.
2. Put it in the mobile build environment before creating the release APK:

```dotenv
EXPO_PUBLIC_EAS_PROJECT_ID=your-expo-project-id
```

3. Install a new signed APK, sign in as a member, then open **Notifications**
   and enable **Push notifications**. Android asks for permission; the member
   can decline and still use the app normally.
4. Once the worker is online and a physical device is registered, set
   `EXPO_PUSH_NOTIFICATIONS_ENABLED=true` in the API and `queue-worker`
   services, then redeploy both. Keep it `false` while testing the API only.

## 6. Verify staging before changing the mobile application

1. Open the web Railway URL and sign in with the staging Admin account.
2. Test catalog, borrowing, return, reports/CSV, notifications, and responsive layout.
3. Create a staging member account and test the member flow.
4. Confirm the API health endpoint and web browser requests use HTTPS with no CORS errors.
5. Do not upload important cover files in this staging setup: `FILESYSTEM_DISK=local` is ephemeral on Railway. Use object storage before production.
6. Password-reset emails are not delivered while `MAIL_MAILER=log`; configure a real staging mail provider before accepting password-recovery testing.
7. For push testing, grant notification permission on one physical Android
   device, register it from the mobile Notifications screen, then set a test
   loan due date within the reminder window. Confirm both an in-app record and
   one device notification. Test a denied permission as well.

## 7. Produce a mobile build that works without Wi-Fi development tools

The current `app-debug.apk` requires Metro, even if the API is deployed. After the web/API staging smoke test passes:

1. In the original repository, update `mobile/.env` with the public API URL:

```dotenv
EXPO_PUBLIC_API_URL=https://your-api-domain.up.railway.app/api/v1
EXPO_PUBLIC_EAS_PROJECT_ID=your-expo-project-id
```

2. Synchronize the short Android build copy:

```powershell
cd "C:\Users\jttra\Documents\Codex\2026-08-21\referenced-chatgpt-conversation-this-is-an\App-Dev\mobile"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Sync-AndroidBuildCopy.ps1 -PrepareAndroid
```

3. Open `C:\Users\jttra\LibraryApp\App-Dev\mobile\android` in Android Studio.
4. Select **Build** > **Generate Signed Bundle / APK** > **APK**. Create and store the signing keystore safely, outside Git.
5. Install the signed release APK and test it using mobile data or any Wi-Fi network. Metro is not required for this release build.

A release APK normally cannot replace a debug APK because they use different signing keys. Uninstall the debug build first if Android asks for a signature conflict.

## 8. Deploy changes after a fix

For backend or web changes:

```powershell
git add .
git commit -m "fix(scope): describe the correction"
git push origin staging
```

Railway automatically rebuilds the affected service from `staging`. A change to `VITE_API_BASE_URL` requires a web rebuild. A change to the mobile API URL or mobile code requires a new signed APK; installed APKs do not update themselves.

## 9. Later production deployment

Create a separate Railway production environment and a separate MySQL database. Deploy from `main`, use production-only secrets, do not run `DemoCatalogSeeder`, configure object storage/mail/backups, and repeat the smoke tests. A custom domain is optional: Railway's generated HTTPS domain works for a small demonstration, while a custom domain is useful only when the school wants a branded public address.
