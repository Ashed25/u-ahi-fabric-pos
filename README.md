# ဦးအဟိ အထည်ဆိုင် — POS

Offline-first point of sale for a Myanmar clothing & fabric shop: Android tablet + barcode scanner, Burmese first, fabric sold in traditional units (ကိုက် · တောင် · ထွာ · မိုက် · လက်မ).

**Live test version:** https://ashed25.github.io/u-ahi-fabric-pos/

> Status: phases 0, a–f are done (products, barcodes, labels, import, backup, selling, payments, sales history, fabric rolls, remnants, stock, returns/exchanges, voids, daily summary, reports, CT report, Excel exports, **users & PINs, roles, auto-lock, audit log, discounts**). Next: cloud backup/sync (phase g) and the Burmese guides.

## First start: users and PINs

1. The first time the app opens it asks you to create the **owner**: a name, a 4-digit **PIN** (to log in) and a **password** (at least 6 characters, for the owner area: settings, users, import, backup, audit log).
2. Menu → **👥 အသုံးပြုသူများ** → add people with their own PIN and role:
   - **ရောင်းသူ Seller** (the parents): sell, hold, today's summary, sales history. No price changes, refunds, voids or discounts; no costs or profit.
   - **မန်နေဂျာ Manager:** also returns/voids, stock, products & prices, labels, reports, discounts.
   - **ပိုင်ရှင် Owner:** everything.
3. **🔒** locks the app; it also locks by itself after 5 minutes without use (Settings). The open sale is kept.
4. When a seller starts a return or a void, or links an unknown barcode, the app asks for a **manager or owner PIN** on the spot. The approver is recorded.
5. Menu → **📜 စာရင်းစစ် မှတ်တမ်း** (owner): every price change, discount, void, refund, stock change, setting, user change and export, with who and when.

> Updating from an earlier test version: the app now asks you to create the owner first; your products and sales are kept. There are no PINs yet, so don't use it in the shop yet.

## No scanner yet? Three ways to "scan"

| Where | How |
|---|---|
| **Sell screen → ဓာတ်ပုံဖြင့် ရွေးရန်** | Type a barcode number (e.g. `2000000000015`) and tap **ရှာရန်**, or type part of a name, or just tap the photo. |
| **Tablet camera** (Android Chrome) | In *ဓာတ်ပုံဖြင့် ရွေးရန်* or *စကန်နာ စမ်းရန်*, tap **📷 ကင်မရာဖြင့် ဖတ်ရန်** and point the back camera at a printed barcode (or at the barcode book on the laptop screen). Allow camera access when asked. |
| **Scanner test screen** | Type the digits in the box to check what a barcode is. |
| **Your phone** | Open the link on the phone (Android or iPhone) and use **📷 ကင်မရာဖြင့် ဖတ်ရန်**. Each device keeps its own data, so load the demo on the phone too. Show the barcode book on the laptop screen and scan it with the phone. |

Demo barcodes to type: shirt M `2000000000015`, shirt XL `2000000000039`, blue silk `2000000000114`, white cotton `2000000000121`, purple lace `2000000000138`, printed cotton `2000000000145`, towel `8851234567890`. The full list with pictures is in the barcode book (Menu → labels → ဘားကုဒ် စာအုပ်).

## Try it (no install needed)

1. Open the link above in Chrome (tablet or laptop). It opens on the **sell screen**.
2. Tap **☰ မီနူး** (Menu), then **နမူနာ ပစ္စည်း ထည့်ရန်** (Load demo products). This adds 9 demo products: clothes with sizes/colours and fabrics priced per ကိုက် or per တောင်, each with its own barcode.
3. **Print the demo barcodes:** Menu → **ဘားကုဒ် စာကပ် ထုတ်ရန်** → *ဘားကုဒ် စာအုပ်* (barcode book) → Preview → Print on plain A4. Choose *Scale 100%* and *Margins: None*.
4. **Sell (the main screen):**
   - Scan a shirt: it is added with its price. Scan it again for ×2.
   - Scan a fabric: the length screen opens. Tap a quick cut, or build any mix with **+ ကိုက်**, **+ တောင်**, **+ ထွာ**, **+ မိုက်**… The price updates live (rounded to 50 Ks). Tap **အိုကေ**.
   - No label? **ဓာတ်ပုံဖြင့် ရွေးရန်** (choose by photo).
   - Tap a line to change the quantity or length, or remove it. **နောက်ဆုံးတစ်ခုဖျက်** removes the last item.
   - **ငွေရှင်းရန်** (Pay): tap note buttons (+20,000 …) and the change shows in big numbers. For KBZPay/WavePay etc. you can type a transaction number. To split a payment, enter part of the amount and tap *ဒီလောက် ပေးပြီး ကျန်တာ နောက်နည်းနဲ့*.
   - **ခဏထားရန်** (Hold) parks a sale for later.
5. **Sales history:** Menu → **အရောင်း မှတ်တမ်း**: every sale with its number, time, items (fabric shown exactly as entered) and payments.
6. **Practice mode:** Menu → **ဆက်တင်များ** → *လေ့ကျင့်ရန် မုဒ်*. An orange banner shows, and nothing is recorded. Good for teaching.
7. **Digital receipt (off by default):** Settings → turn on *ပြေစာ ပြ/ပို့*. Then *Show receipt* appears after a sale, and you can share it as a picture via Viber/Messenger.
8. **Fabric rolls and stock:** Menu → **📦 လက်ကျန်**. The demo has 10 of each clothing size and some fabric rolls.
   - **Blue silk** has 2 rolls. When you sell it, the shorter (open) roll is picked automatically; you can tap the other roll. The roll gets shorter with each sale.
   - **Purple lace** has a remnant roll (✂ 30% off). Tap it in the length screen and the price drops.
   - **Printed cotton** has only 18" left, so the stock screen suggests selling it as a remnant. Tap ✂ အစ → *one price for all* → e.g. 1,500. On the sell screen, *အစ အကုန်ယူ* sells the whole piece.
   - **+ လိပ်အသစ် ဝင်ရန်** receives a new roll; **+ ဝင်** receives clothes; **ပြင်ရန်** corrects stock (a reason is required); **🏷 လိပ် စာကပ်** prints a roll label.
   - **📋 လက်ကျန် စစ်ရန်** (stock count / opening stock): start a count, scan or tap each item, and enter what is really there.
9. **Returns:** Menu → **အရောင်း မှတ်တမ်း** → open a sale → **↩ ပြန်လဲ / ပြန်အမ်း**. Choose what comes back (fabric: back on the roll, or write it off), write a reason, then:
   - **ငွေ ပြန်အမ်း** (refund): pick how the money goes back. A credit note `CN-A-000001` is recorded and stock goes back.
   - **ပစ္စည်း ပြန်လဲ** (exchange): the sell screen opens with a purple *exchange credit* bar. Scan the new items; the credit pays for them. Pay any extra as usual, or get the leftover back in cash.
   - **ပယ်ဖျက်ရန်** (void): only for a sale rung up by mistake. The number stays, marked VOID.
10. **Daily summary:** Menu → **📊 ယနေ့ အနှစ်ချုပ်**: sales, money per payment method, returns, net, what was sold, compared with yesterday and the same day last week. An optional cash check (count the drawer) can be turned on in Settings.
11. **Reports:** Menu → **📈 အစီရင်ခံစာ**: day / week / month / quarter / financial year (Apr–Mar), ◀ ▶ to step back. Shows sales, returns, net, CT, **profit** (uses the cost entered on each product; sales of products without a cost are shown separately), payment methods, staff, and best sellers (fabric in ကိုက်/တောင်). **⬇ Excel** exports the report; *စာရင်းကိုင်အတွက်* exports all data for the accountant.
    - **CT:** the CT button opens the quarterly Commercial Tax report (Q1 Apr–Jun … Q4 Jan–Mar) with an Excel export of the sale-by-sale schedule. When sales over the last 12 months reach 80% / 100% of 50,000,000 Ks (setting), a warning shows on the menu, daily summary and reports. To see it in the demo, set the threshold to e.g. 30,000 in Settings.
12. **Scanner test (စကန်နာ စမ်းရန်):** shows exactly what the scanner sends, if a scan doesn't work.
13. When you are done testing, Menu → **နမူနာ ပစ္စည်း ဖျက်ရန်** (Remove demo products). Test sales stay in the history. To start completely clean, clear the site data in Chrome (Settings → Site settings → this site → Clear data).

**Install on the tablet:** in Chrome, menu ⋮ → *Add to Home screen / Install app*. It then works offline.

**Data stays on each device** (in the browser). The laptop and tablet don't share data until cloud sync (phase g). To print labels on the laptop for products entered on the tablet, use **Backup → Save backup** on the tablet, send the file to the laptop, then **Restore** there.

**Scanner setup:** use the scanner in USB/Bluetooth *keyboard (HID)* mode with *Enter* after each scan, which is the default on most scanners. A Burmese keyboard layout on the tablet is fine.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (pricing, units, barcodes, import, data rules)
npm run e2e        # browser test on a 10" tablet viewport
```

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
