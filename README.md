# ဦးအဟိ အထည်ဆိုင် — POS

Point of sale for a Myanmar clothing & fabric shop. It runs on an Android tablet with a barcode scanner, works offline, is Burmese first, and sells fabric in traditional units (ကိုက် · တောင် · ထွာ · မိုက် · လက်မ · လက်မဝက်).

- **Live app:** https://ashed25.github.io/u-ahi-fabric-pos/
- **Picture guide for sellers (Burmese, one A4 page):** https://ashed25.github.io/u-ahi-fabric-pos/guide.html
- **မြန်မာလို လမ်းညွှန်:** [README.my.md](README.my.md)

## What it does

| Area | Highlights |
|---|---|
| Selling | Scan anywhere; big total; Pay; Remove last; choose by photo / type a barcode / tablet camera; hold & resume; practice mode |
| Fabric | Length built from any mix of units (“2 ကိုက် 1 ထွာ 1 မိုက်”), shown exactly as entered; price rounded per line to 50 Ks (setting); rolls, open-roll first, remnants (% off or one price) |
| Payments | Cash notes with huge change, KBZPay / WavePay / AYA Pay / CB Pay / MPU / bank (configurable), split payments, transaction reference |
| Records | Gap-free sale numbers per device (A-000001), never edited; returns via credit notes (CN-A-000001); exchanges with credit; voids keep their number; optional digital receipt shared as an image |
| Stock | Clothes per size/colour, fabric per roll, receive, adjust with a reason, stock count / opening count, low-stock list |
| Barcodes & labels | In-store EAN-13 (prefix 20), supplier codes by scanning, 40×30 / 50×30 thermal labels, A4 sticker sheets, roll labels, barcode book with photos |
| Reports | Day / week / month / FY quarter / FY (Apr–Mar), profit from cost snapshots, best sellers (fabric in traditional units), by payment method and staff; CT report per quarter; CT registration warning at 80 % / 100 % of 50,000,000 Ks; Excel exports |
| People | Owner / Manager / Seller with 4-digit PINs, manager-PIN approvals, owner password, auto-lock, audit log |
| Safety | Works offline; daily backup reminder; backup file export/restore; Supabase cloud sync with read-only viewers and tablet replacement |

## First start

1. Open the app. It asks you to create the **owner**: name, 4-digit PIN, and password (at least 6 characters, for settings, users, import, backup and the audit log). **Write the password down**: there is no password reset.
2. **Menu → 👥 Users:** add each person with their own PIN. Use **Seller** for the parents.
3. **Menu → ⚙️ Settings:** shop address and phone, payment methods, rounding (default nearest 50 Ks for fabric lines), receipt (off by default), CT (off by default).
4. Add products (below), print labels, do an opening stock count (**Menu → 📦 Stock → 📋 Stock count**).
5. To try everything first, use **Menu → Load demo products** (owner). **Remove demo products** removes them again; demo sales stay in history.

## Install on the tablet

1. Open the live link in **Chrome** on the Android tablet.
2. ⋮ → **Add to Home screen / Install app**. It then opens full-screen and works **offline**.

## Connect the barcode scanner

- Put the scanner in **USB / Bluetooth keyboard (HID) mode** with **Enter** after each scan. This is the default on most scanners.
- Pair it in Android Bluetooth settings (or plug it in with USB-OTG).
- Open **Menu → 🔍 Scanner test** and scan a label: it beeps and shows the product. A Burmese keyboard layout on the tablet is fine, because the app reads the physical keys.
- **No scanner?** In *Choose by photo*, type the barcode number or a name, or tap **📷 Read with camera** (works on Android, iPhone and laptop webcams).

## Add products

- **One by one:** Menu → 👕 Products → + New product. Choose *Sold by piece* (sizes/colours, each with its own barcode) or *Sold by length* (pricing unit, price per unit, width, quick-cut buttons). Take a photo with the tablet camera.
- **Many at once (~500):** Menu → 📥 Import → download the **Excel template**, fill one row per product (one row per size/colour; see the *help* sheet), then choose the file. Errors are listed by row and nothing is imported until the file is clean. Barcodes are created automatically; an existing barcode can go in the `barcode` column (format it as Text).
- **Supplier barcodes:** on a product, *Scan an existing barcode*. Every barcode is unique; a duplicate shows which product already uses it.

## Print barcode labels (from a laptop)

1. Make the laptop's data match the tablet: either connect both to the cloud (below, with the laptop as **viewer**), or save a backup file on the tablet and restore it on the laptop.
2. On the laptop: **Menu → 🏷 Labels**. Choose **40×30 mm** or **50×30 mm** (thermal label printer), **A4 sticker sheet** (set the sheet size and skip used stickers), or **Barcode book** (A4 with photos, kept at the counter).
3. Choose a category and the number of copies → **Preview** → **Print**. In the print dialog choose the label printer, **Scale 100 %** and **Margins: None**.
4. **Tagging day:** Menu → ✅ Tagging day: print per category and tick off what is labelled. Fabric **roll labels**: Stock → a fabric → 🏷 on a roll.

## Daily use

- **Selling:** see the [picture guide](https://ashed25.github.io/u-ahi-fabric-pos/guide.html) (also Menu → 📖). Sellers sell; returns, voids and discounts need a manager or owner PIN.
- **📊 Daily summary:** sales, money per method, returns, what was sold, compared with yesterday and the same day last week; optional cash check (Settings).
- **Returns:** Sales history → a sale → ↩ Return / exchange (refund, or exchange credit used on the next sale).

## Reports and exports

- **Menu → 📈 Reports:** choose the period, ◀ to go back. **⬇ Excel** exports the report (summary, payment methods, best sellers, sale-by-sale schedule, items). **All data for the accountant** exports every table.
- **CT:** Reports → *Commercial Tax (CT)*: quarters Q1 Apr–Jun … Q4 Jan–Mar with an Excel export. Rates and the 50,000,000 Ks threshold are settings; have an accountant confirm them.

## Backup and cloud

**Backup file (no account needed):** Menu → 💾 Backup → *Save backup* (share to Google Drive / Viber, or download). The owner sees a reminder on the menu when the last backup is older than a day. *Restore* replaces all data on that device and first saves a copy of what was there.

**Cloud (Supabase, free):** automatic, every 30 seconds while online.

1. Create a project at [supabase.com](https://supabase.com) (region: Singapore).
2. SQL Editor → paste the SQL shown on **Menu → ☁️ Cloud** (*Copy SQL*) → Run.
3. Authentication → Users → **Add user** (email + password, Auto Confirm on).
4. Project Settings → API → copy the **Project URL** and the **anon public** key.
5. On the **shop tablet**: Menu → ☁️ Cloud → enter URL, key, email, password → **Connect** → **The shop tablet**. Everything is uploaded, and from then on every change.
6. On the **laptop / phone**: same connect → **Laptop / phone (view only)**. It downloads a full copy (log in again with your shop PIN) and refreshes every 30 s. A viewer cannot change data, so the copies never drift apart.
7. **Tablet broken or replaced?** On the new tablet: install, create a temporary owner, Cloud → connect → **Use this device instead of a broken shop tablet**. Everything comes back, and sale numbers continue without gaps.

The free Supabase project **pauses after 7 days without use** (for example a long holiday). The app keeps selling and shows *cloud can't be reached*. Sign in at supabase.com, open the project and press **Restore project**; waiting changes are then sent automatically.

## Deploy your own copy

The app is static files: no server is needed.

- **GitHub Pages (used here):** `.github/workflows/deploy.yml` runs the tests, builds with `BASE_PATH=/<repo>/` and deploys on every push to `main`. In the repo: *Settings → Pages → Source: GitHub Actions*.
- **Cloudflare Pages (free, commercial use allowed):** Workers & Pages → Create → Pages → connect the repo. Build command `npm run build`, output directory `dist`. No `BASE_PATH` needed. (Vercel's free Hobby plan is non-commercial only.)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests: units, pricing, rounding, tax, stock, returns, reports, users, sync
npm run e2e          # browser tests on a 10" tablet viewport (signs in, loads the demo)
BASE_URL=https://ashed25.github.io/u-ahi-fabric-pos/ npx playwright test   # the same against the live site
GUIDE_SHOTS=1 npx playwright test guide-shots                                # refresh the guide pictures
```

React + Vite + TypeScript + Tailwind, installed as a PWA; data in IndexedDB (Dexie); money in whole Ks and lengths in tenths of an inch (never floats). Core rules live in `src/core/` (pure, unit-tested); data rules and permissions in `src/db/`; cloud sync in `src/sync/`; screens in `src/screens/`; texts in `src/i18n/my.json` and `en.json`.
