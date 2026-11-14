# ဦးအဟိ အထည်ဆိုင် — POS

Offline-first point of sale for a Myanmar clothing & fabric shop: Android tablet + barcode scanner, Burmese first, fabric sold in traditional units (ကိုက် · တောင် · ထွာ · မိုက် · လက်မ).

**Live test version:** https://ashed25.github.io/u-ahi-fabric-pos/

> Status: phases 0 and a are done (products, barcodes, labels, import, backup). The sell screen comes in phase b. Full English + Burmese guide comes with the final phase.

## Try it (no install needed)

1. Open the link above in Chrome (tablet or laptop).
2. On the home screen tap **နမူနာ ပစ္စည်း ထည့်ရန်** (Load demo products). This adds 9 demo products: clothes with sizes/colours and fabrics priced per ကိုက် or per တောင်, each with its own barcode.
3. **Products (ပစ္စည်းများ):** open one, change it, add a size, add a quick-cut length.
4. **Labels (ဘားကုဒ် စာကပ် ထုတ်ရန်):** choose 40×30, 50×30, A4 sheet or barcode book → Preview → Print. Choose *Scale 100%* and *Margins: None*.
5. **Scanner test (စကန်နာ စမ်းရန်):** connect the scanner, then scan a printed label. You can also scan from the laptop screen with the barcode book preview (needs a camera/2D scanner; laser scanners can't read screens). It should beep and show the product name. The towel also has a "supplier" code, `8851234567890`.
6. When you are done testing, tap **နမူနာ ပစ္စည်း ဖျက်ရန်** (Remove demo products) on the home screen.

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
