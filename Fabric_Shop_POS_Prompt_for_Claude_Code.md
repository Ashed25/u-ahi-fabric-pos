# Build: Simple POS for a Myanmar clothing & fabric shop (tablet + barcode scanner)

You are building a custom Point of Sale (POS) app for an **existing family clothing and fabric shop in Myanmar** that is moving from a paper notebook to a POS. It runs on an **Android tablet** at the counter with a **barcode scanner** (Bluetooth or USB). **There is no receipt printer and no cash drawer** — nothing is printed at the counter. The app's job is: scan products → show them on the tablet → record the sale → track revenue and stock. The people selling at the counter include the owner's **elderly parents**, so **ease of use is the #1 requirement** — every design decision should favour simplicity, big text, and mistake-proofing over features.

**Start in plan mode.** Read this whole brief, then propose the architecture, data model, screen flow and a phased plan, list your questions, and wait for my approval before writing code. Build in small working phases; commit after each.

Shop name / logo: `[SHOP NAME]` — placeholder; make it a setting, logo file at `/public/logo.png` if provided.

---

## 1. What the shop sells

1. **Ready-made clothes** — sold per piece (qty 1, 2, 3…). May have size/colour variants.
2. **Fabric cut from the roll** — sold by **length** using **Myanmar traditional units** (see §3). The customer chooses a fabric, the staff cuts the length from the roll at the counter, and the price = length × price per unit.

- Around **500 product types** to start. **No existing barcodes** — the system must generate its own and produce printable labels (printed from a laptop, see §4).
- **Fixed prices** (no bargaining). Discounts are rare and owner-controlled.
- No other services (no tailoring).

## 2. Tech stack (suggested — challenge it if you have a better reason)

- React + Vite + TypeScript + Tailwind, installed on the tablet as a **PWA** (no printer integration is needed at the counter, so a PWA should be enough — confirm in the plan).
- **Offline-first:** internet and power in Myanmar are unreliable; selling must never stop. Local storage with IndexedDB (Dexie.js); cloud backup/sync with **Supabase** (free tier) when online.
- Vitest for all money, unit-conversion and stock logic; Playwright for the sell flow.
- No monthly paid services required. Host the app on **Cloudflare Pages (free, commercial use allowed)**. Supabase free tier has **no automatic backups** and pauses after 7 days without use (e.g. long holiday closures), so build: an automatic daily backup export (JSON/Excel) the owner can save to Google Drive or a laptop, a one-tap restore, and a clear message + instructions if the cloud is paused. The app must keep selling offline even if the cloud is unavailable.

## 3. Myanmar fabric length units (core requirement)

| Unit (Burmese) | English | Inches |
|---|---|---|
| ကိုက် | gaik / yard | 36 |
| တောင် | taung (cubit) | 18 |
| ထွာ | htwa (span) | 9 |
| မိုက် | maik (fist) | 4.4 |
| လက်မ | inch | 1 |
| လက်မဝက် | half inch | 0.5 |

Half an inch (လက်မဝက်) is the smallest unit used.

Common fabric widths (product attribute, shown on screen, does **not** change price): **36" (narrow, 1 gaik / 2 taung), 45" (standard, 2 taung 1 htwa / 1 gaik 1 htwa), 58.4" (wide, 3 taung 1 maik)**. Allow custom widths.

Rules:
- **Store all lengths internally as integer tenths of an inch** (e.g. 1 maik = 44, 1 yard = 360) to avoid floating-point errors. Never store floats for length or money.
- Units, their Burmese names and inch values live in a **settings table**, not hard-coded.
- Each fabric product has a **price per unit** and the owner picks the pricing unit per product (usually per ကိုက် or per တောင်). Price = length_in_tenths ÷ unit_in_tenths × unit_price, then rounded per the rounding rule (§6).
- Lengths are always **displayed the traditional way**, e.g. `1 ကိုက် 1 တောင်` or `2 တောင် 1 ထွာ`, with inches shown small underneath. Write a well-tested formatter (inches → largest-units-first breakdown) and parser.

### Length entry screen (when a fabric is scanned or tapped)
Big, simple, one screen:
- Fabric name, photo, width, price per unit, and **length left on the roll**.
- **Quick buttons for common cuts** (configurable per product), e.g. `1 တောင်`, `1 ကိုက်`, `1 ကိုက် 1 တောင်`, `2 ကိုက်`, `3 ကိုက်`.
- **Unit add buttons:** `+ ကိုက်`, `+ တောင်`, `+ ထွာ`, `+ မိုက်`, `+ လက်မ`, `+ လက်မဝက်` and `−` buttons, building up the length (e.g. tap ကိုက် ×2, တောင် ×1 → 2 ကိုက် 1 တောင်). Live display of the length and the **price in very large numbers**.
- Optional numeric keypad for inches.
- Warn (don't block) if the length is more than what's left on the roll.
- Big **OK / အိုကေ** and **Cancel / မလုပ်တော့** buttons.

### Roll stock
- Each fabric has one or more **rolls**; each roll has a starting length and current remaining length (in tenths of an inch). Selling deducts from the roll; receiving a new roll adds one.
- **Remnants:** when a roll gets short (configurable, e.g. under 1 ကိုက်), offer to mark it as a remnant with a set price or % discount.
- Stock adjustments for cutting waste / measuring differences, always with a reason and user.
- Low-stock alert per fabric (total length left across rolls).

## 4. Barcodes (shop has none today)

- **Scan to assign:** on the product page (and during stock-in), the owner can scan an existing barcode (e.g. a supplier's barcode or a pre-printed sticker) to link it to the product instead of generating a new one. A product may have more than one barcode; every barcode must be unique across all products — warn clearly if a scanned code is already in use.
- **Unknown barcode at the counter:** show a friendly Burmese message and let the owner (PIN) assign it to a product on the spot or ignore it.
- **Generate internal barcodes** for every product/variant (EAN-13 using an in-store prefix 20–29, or Code 128 — recommend one). Barcodes must be unique and never reused.
- **Print labels from a laptop** (labels are generated as a PDF/HTML page and printed through the printer's normal driver — no direct printer integration needed). Support both a cheap USB thermal label printer and **A4 sticker sheets** on a normal office printer. Label printer layouts (e.g. 40×30 mm and 50×30 mm) and A4 sheet layouts: shop name, product name (Burmese), size/colour or width, price (per piece, or per ကိုက်/တောင် for fabric), barcode.
- For fabric, print a **roll label** for the roll end/cardboard tube.
- **Printed barcode book (A4 PDF)** with photos and barcodes grouped by category, kept at the counter as a backup for items whose label fell off.
- The scanner acts as a keyboard (HID): capture scans anywhere on the sell screen without needing to tap a field first; ignore scans while a dialog that doesn't expect them is open.

## 5. Ease of use (for elderly staff) — must-haves

- **Burmese first** (Myanmar Unicode only — Noto Sans Myanmar / Pyidaungsu, never Zawgyi), English toggle. All strings in i18n files.
- **Big everything:** minimum 20px body text, totals 48px+, buttons at least 64px tall, high contrast, no tiny icons without labels. Large-text mode.
- The **Sell screen has only:** scan area, item list (photo + name + qty/length + price), big total, **Pay** button, and a big **Remove last item / နောက်ဆုံးတစ်ခုဖျက်** button. Nothing else.
- **Photo grid** by category for items without a working barcode (tap picture to add).
- **One clear action per screen**; confirm screens for anything important; nothing destructive possible for the "Seller" role.
- **Practice mode** (clearly coloured banner) where sales are not recorded — for training.
- Sounds: a clear beep on successful scan, a different sound on errors ("item not found").
- Friendly error messages in simple Burmese, e.g. "ဒီပစ္စည်း မတွေ့ပါ — ဓာတ်ပုံဖြင့် ရွေးပါ" (item not found — choose by photo).
- Auto-return to the Sell screen after a sale completes.
- Usable in portrait or landscape; tested on a ~10" Android tablet.

## 6. Checkout & payments

- Payment methods: **Cash, KBZPay, WavePay, AYA Pay, CB Pay, MPU/card, bank transfer** (configurable list). Split payments allowed.
- Cash: enter amount received using **big quick buttons for common notes** (1,000 / 5,000 / 10,000 / 20,000 Ks) → show **change due** in huge numbers.
- Mobile payments: optional field for the transaction reference.
- **Rounding:** configurable rounding of the final total (none / nearest 10 / 50 / 100 Ks), applied once on the total and shown as a "rounding" line. Ask me which default.
- Currency MMK, no decimals, thousand separators. Time zone **Asia/Yangon (UTC+06:30)**. Myanmar financial year **1 April – 31 March**.
- Hold/park a sale and resume.
- Returns/exchanges: look up the sale (by sale number, date or product), return items (pieces back to stock; fabric returns optional, with length back to the roll or written off), refund or exchange. Manager PIN required. Creates a credit note linked to the original sale.

## 7. Sales records (no printed receipts)

- **Nothing is printed.** Every completed sale is saved with a sale number, date/time, seller, items, totals and payment method.
- **Sales history screen** (owner): list of all sales, search by date/product/sale number, tap a sale to see full details.
- **Optional digital receipt, OFF by default** (setting): show the receipt on screen and/or share it as an image via Viber/Messenger if a customer asks for proof of purchase. When shown it contains: shop name/logo, address, phone, TIN/CT number (if set), receipt number, date/time, cashier, each line (fabric lines show the traditional length, e.g. `ပိုးထည် အပြာ — 2 ကိုက် 1 တောင် @ 8,000/ကိုက်`), subtotal, discount, CT if registered, rounding, total, payments, change, return policy and thank-you text. Re-shared copies marked "COPY / မိတ္တူ".

## 8. Owner area (PIN-protected)

- **Products:** add/edit clothes (per piece, optional size/colour variants) and fabrics (per length, width, price per unit, quick-cut buttons, rolls). Photos via tablet camera.
- **Bulk import from Excel/CSV** — provide a template — so the ~500 products can be entered on a laptop and imported; barcodes auto-generated on import. Bulk label printing by category.
- **Stock:** receive new stock / new rolls, adjustments with reasons, stock count mode (scan items and enter counts), low-stock list.
- **Reports:** today / week / month / custom / financial year & quarter — sales, profit (if cost entered), best sellers (pieces and fabric length sold), sales by payment method, by staff; fabric reports in traditional units. Export everything to Excel/CSV.
- **Daily summary screen** (no formal cash count): e.g. "Today: 25 sales — 1,250,000 Ks — Cash 800,000 · KBZPay 450,000", items/fabric sold today, and a comparison with yesterday / same day last week. Optional simple cash check (enter cash counted, see difference) — off by default.
- **Users & roles:** Owner, Manager, Seller (parents). 4-digit PINs, large PIN pad. Sellers cannot change prices, delete, refund, discount, or see costs/profit.
- **Settings:** shop details, units, rounding, payment methods, digital receipt on/off and text, tax settings, label layouts.

## 9. Legal & compliance (Myanmar) — build in, all as settings

> Based on Myanmar's 2026 Union Taxation Law; rates and thresholds change yearly, so nothing is hard-coded. The owner will confirm with an accountant. The shop is **not sure yet** whether it is registered for Commercial Tax.

- **Commercial Tax (CT):** setting `CT registered: yes/no` (default **no**), rate default **5%**, prices tax-inclusive/exclusive. When on, sales records (and digital receipts) show net amount, CT and total; store the rate used on each line.
- **CT threshold tracker:** businesses with annual sales over **50,000,000 Ks** must register for CT. Show a dashboard warning at 80% and 100% of rolling 12-month sales (threshold configurable).
- **CT report** per quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) and financial year: sales excluding CT, CT collected, refunds, and a sale-level sales schedule — Excel export.
- **Sale numbers:** every sale gets a unique, sequential number with **no gaps** (these become receipt numbers if digital receipts are turned on, and are required if the shop registers for CT and must issue receipts), prefixed per device so offline tablets never clash; voided sales stay in sequence marked VOID.
- **Record integrity:** completed sales, payments and credit notes cannot be edited or deleted — only reversed with a linked record, reason and approving user.
- **Audit log** of price changes, discounts, voids, refunds, stock adjustments, cash in/out, settings and user changes, exports.
- Keep financial records indefinitely by default; full data export for the accountant.
- **Consumer protection:** prices visible to the customer on the tablet before payment; return/exchange policy configurable (shown on digital receipts when enabled).
- **Customer data (if collected):** minimal (name, phone), access restricted to Owner/Manager.
- **Security:** hashed PINs, auto-lock after inactivity, owner password for owner area, daily cloud backup + manual full backup/restore.

## 10. Rollout support (build these in)

- Excel import template + instructions for entering the ~500 products.
- "Tagging day" helper: print labels by category, tick off what's labelled.
- Opening stock count flow (pieces and roll lengths).
- Practice mode for training the parents.

## 11. Deliverables

1. Plan, data model (ERD) and screen flow sketches for approval.
2. Phases: (a) products, units & barcodes/labels, (b) sell screen + length entry + payments + sales history, (c) roll stock & remnants, (d) returns, daily summary, (e) reports, CT report & exports, (f) users/roles, audit log, (g) cloud backup/sync.
3. Unit tests for unit conversion, length formatting, pricing, rounding, tax, stock and refunds; e2e test for a sale with one clothing item + one fabric cut.
4. `README.md` in English and Burmese: running locally, deploying (Cloudflare Pages free plan, which allows commercial use — not Vercel Hobby, which is non-commercial only — plus Supabase), installing on the tablet, connecting the scanner, printing barcode labels from a laptop, importing products, exporting reports.
5. A one-page **picture guide in Burmese** for the parents (how to sell, how to sell fabric, how to take payment, what to do if an item won't scan).

**Before coding, ask me anything unclear** — e.g. shop name, exact tablet/scanner/label printer models, default rounding, and whether any fabrics are sold per တောင် instead of per ကိုက်.
