# Connecting LinkedIn

Application Pal can keep a read-only copy of your LinkedIn profile up to date. The LinkedIn-Check scores this copy, and the Profile page offers your LinkedIn headline and About text for reuse.

It uses LinkedIn's official **Member Data Portability API**, which LinkedIn provides under the EU Digital Markets Act. The rules that follow from this:

- **Region:** only members whose LinkedIn location is in the **EU/EEA or Switzerland** can use it. Everyone else gets an error from LinkedIn and can use the ZIP export instead (*Settings → Data privacy → Get a copy of your data*).
- **Read-only:** Application Pal never changes or posts anything on LinkedIn, and it never asks for your LinkedIn password.
- **Your own app:** the self-serve product only lets a member read their *own* data. Each user therefore creates a small LinkedIn developer app once. It is free and takes about ten minutes.
- **Token lifetime:** an access token lasts **60 days** and cannot be refreshed. The Profile page shows the expiry date and warns you a week ahead. With the OAuth route, reconnecting is one click.
- **Company page:** LinkedIn requires every developer app to be linked to a company page. For this product LinkedIn provides its own page, **Member Data Portability (Member) Default Company**. You use that page; you never create one.

Official guide by LinkedIn: [Member Data Portability (Member)](https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/?view=li-dma-data-portability-2026-08) on Microsoft Learn.

---

## Step 1 — Create the developer app

1. Open [developer.linkedin.com](https://developer.linkedin.com/) → **My apps** → **Create app**.
2. Enter any **App name**, e.g. "Application Pal – <your name>".
3. For **LinkedIn Page**, pick **Member Data Portability (Member) Default Company** ([page](https://www.linkedin.com/company/member-data-portability-member-default-company)). LinkedIn created this page especially for requesting access to this product. Do **not** create a company page of your own while creating the app: LinkedIn's guide says access can be requested *only* if the app uses the default page.
4. Upload any logo, accept the legal agreement and create the app.

## Step 2 — Request the product

1. In the app, open the **Products** tab.
2. Next to **Member Data Portability API (Member)**, click **Request access**.
3. Accept the terms. Access is normally granted immediately.

## Step 3 — Connect in Application Pal

Open **Profile → LinkedIn**. There are two ways to connect.

### A — With your LinkedIn app (recommended)

1. In the developer app, open the **Auth** tab and add the **redirect URL** shown on the Profile page. By default it is `<APP_URL>/api/linkedin/callback`, e.g. `http://localhost:8070/api/linkedin/callback`.
2. Copy the **Client ID** and **Client Secret** from the Auth tab into the Profile page.
3. Click **Save and connect to LinkedIn**, sign in on LinkedIn and click **Allow**.

You come back to the Profile page and the first sync starts.

> The scope `r_dma_portability_self_serve` is the default. It is the scope LinkedIn's member guide uses with the token generator. LinkedIn's API reference pages (Member Snapshot, Member Changelog) list `r_dma_portability_member` instead ("Allows users to download their own LinkedIn data"). If LinkedIn rejects the sign-in, switch the scope on the Profile page or use route B.

### B — Paste an access token

1. Open LinkedIn's [token generator](https://www.linkedin.com/developers/tools/oauth/token-generator) (*Docs and tools → OAuth Token Tools → Create token*).
2. Pick your app and the scope `r_dma_portability_self_serve`, then click **Request access token**. Sign in and click **Allow**.
3. Copy the token, paste it on the Profile page and click **Check and connect**.

When the token expires, repeat these three steps.

---

## What is synced

| Loaded | Not provided by LinkedIn |
|---|---|
| Headline, About, location, industry, websites | Profile photo, banner |
| Experience, education, skills (with endorsement count) | Custom profile URL (the URL field on the Profile page is used) |
| Certifications, languages, honors, projects, publications, courses, volunteering | Featured section |
| Recommendations received (and the count of those given) | "Open to" settings |
| Posts, comments, articles, groups | |
| Connections: **count only**, names are never stored | |

The LinkedIn-Check marks the items LinkedIn does not provide as "not rated" until you report them yourself. It never guesses them.

Sync behaviour:
- **When it runs:** right after connecting, when you click **Update now**, and automatically when you open the Profile page and the last sync is more than 24 hours old.
- **Versions:** each sync that changed something is saved as a new profile version. Identical syncs are not stored twice.
- **First sync:** right after the first consent, LinkedIn may need up to about 30 minutes to collate your data. If the sync reports that LinkedIn is still preparing it, try again later.

## Data and privacy

- The client secret and access token are stored only in your own database (`linkedin_connections`). They are **never** included in the JSON export.
- Synced profile versions (`linkedin_versions`) belong to your user data and are included in the export.
- **Disconnect** removes the token. *Disconnect and delete app details* also removes the client ID and secret. Synced versions stay in both cases.

## API details

- Snapshot: `GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria&domain=…` with `Linkedin-Version: 202312`. LinkedIn states that this endpoint supports **only** `202312`; any other version fails with `426 NONEXISTENT_VERSION`. Application Pal sends `202312` (`LINKEDIN_API_VERSION` in `backend/src/linkedin.ts`).
- Pagination: LinkedIn warns that `paging.total` may be too low. Keep requesting pages until LinkedIn answers "No data found for this memberId".
- The Member Changelog API covers only the last 28 days of interactions (posts, comments). The snapshot holds the full history.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:8070` | Base of the redirect URL and of the page you return to after sign-in |
| `LINKEDIN_REDIRECT_URI` | `<APP_URL>/api/linkedin/callback` | Override when the app runs behind another host name |

## Troubleshooting

| Message | Cause / fix |
|---|---|
| *No access: the app needs the product …* | Step 2 is missing, or the app is attached to the wrong LinkedIn page (step 1.3). |
| **Request access** is missing for the product, or the request is refused | The app is linked to a company page of your own. Create a new app and pick the **Member Data Portability (Member) Default Company** page. |
| *LinkedIn refused the access (expired or revoked)* | The token expired or was revoked. Reconnect. |
| *LinkedIn is still collating your data* | This happens on the first sync after consent. Wait a few minutes. |
| LinkedIn shows "redirect_uri does not match" | The redirect URL in the app's Auth tab must match the one on the Profile page exactly, including `http`/`https` and the port. |
| LinkedIn says the feature isn't available in your region | Your LinkedIn profile location is outside the EU/EEA/Switzerland. Use the ZIP export instead. |
