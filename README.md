# ဦးအဟိ အထည်ဆိုင် — POS

Offline-first point of sale for a Myanmar clothing & fabric shop: Android tablet + barcode scanner, Burmese first, fabric sold in traditional units (ကိုက် · တောင် · ထွာ · မိုက် · လက်မ).

**Live test version:** https://ashed25.github.io/u-ahi-fabric-pos/

> Status: phases 0, a and b are done (products, barcodes, labels, import, backup, **selling**, payments, sales history). Next: roll stock, returns, reports, users/PINs, cloud sync. There are no PINs yet, so don't use it in the shop yet.

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
8. **Scanner test (စကန်နာ စမ်းရန်):** shows exactly what the scanner sends, if a scan doesn't work.
9. When you are done testing, Menu → **နမူနာ ပစ္စည်း ဖျက်ရန်** (Remove demo products). Test sales stay in the history. To start completely clean, clear the site data in Chrome (Settings → Site settings → this site → Clear data).

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
