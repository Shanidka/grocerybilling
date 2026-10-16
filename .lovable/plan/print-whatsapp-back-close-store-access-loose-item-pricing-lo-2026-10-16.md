# Print, WhatsApp, Back/Close, store access, loose-item pricing, loyalty

Nothing else in billing, stock, reports or settings changes.

## 1. Print bills straight from the app
- The checkout screen gets three buttons: **Complete**, **Complete & Print**, **Complete & Share**.
  - **Complete**: saves the bill only. No download, no print.
  - **Complete & Print**: saves the bill, then opens the browser print window right away with the receipt (80mm thermal size). No trip to Downloads.
  - **Complete & Share**: saves the bill, then opens the share window (see 2).
- After saving, the share window also has a **Print** button, so you can still print later if the customer asks for a paper bill.
- Bill History in Reports gets a **Print** button on each bill too.
- The PDF download stays available as a "Save PDF" button.

## 1b. Choose where bills are saved
- In Settings, a **Choose bill folder** button lets you pick a folder on the PC, for example D:\Bills. After that, every saved bill PDF goes straight into that folder, not Downloads.
- The app remembers the folder. The browser may ask once per session to allow access again. That is a browser safety rule and the app can't skip it.
- Works in Chrome and Edge on Windows/PC. On phones and Safari, this isn't possible. There, "Save PDF" opens a save/share window so you can pick the location each time.

## 2. Send the bill on WhatsApp
- The share window has a phone field. It fills in the customer's number if you typed one during billing, and you can change it.
- **Send on WhatsApp** opens WhatsApp (the app on phone, WhatsApp Web/Desktop on PC) with that customer's chat already open. The message is ready: shop name, bill number, total, savings and the online invoice link. You press Send once.
- 10-digit Indian numbers get +91 added automatically. A wrong number shows a warning.
- Limitation: sending with zero taps needs a paid WhatsApp Business API account. This plan uses the free route, which needs that one tap on Send. Auto-send can be added later if you get the Business API.

## 3. Go Back and Close everywhere
- Every page, except Dashboard, gets a **← Back** button at the top. It returns to the page you came from, or to Dashboard if there isn't one.
- Every alert, popup and notification gets a visible **×** Close button, including the low-stock alert, the dashboard alert banner and the pop-up messages.

## 4. Store access per employee
- On the Staff page, each person has a **Stores** setting: either **All stores** or a ticked list of specific stores. It applies to new and existing staff.
- Admins and managers can change it at any time. Managers can't change an admin's store access.
- Staff see only their allowed stores in the store switcher. They can't open data from any other store.
- Existing staff start with **All stores**, so nothing changes for them until you edit it.

## 5. Smart stock for loose items (sugar, rice, dal)
- Loose items keep **one selling price per kg** no matter what each purchase cost. A new purchase at a different buying price adds stock but never changes the selling price.
- Each purchase's buying price is recorded, and the product shows its **average buying price** (weighted by quantity bought).
- A new **Price averages** view in Reports shows average buying price and average selling price per product, grouped by **day, week, month or year**. It follows the report's date range.
- Profit on loose items uses the average buying price at the time of sale.

## 6. Customer loyalty program
- Rules: every **Rs.100** spent earns **1 point**, and **10 points = Rs.1** off a bill.
- Off by default. An admin or manager turns it on in Settings, where the earn and redeem rates can also be changed.
- Only customers with a phone number can join. Each customer profile gets a **Loyalty** on/off switch and **Add to loyalty** button, plus their points balance and history.
- At billing, entering a member's phone shows their points. The cashier can redeem points as a discount. Points are earned automatically when the bill is completed.
- Points show on the printed and WhatsApp bill.

## Technical details
- Migration: `products.avg_cost numeric`. Trigger on `purchase_items` insert recomputes the weighted average (`(stock*avg + qty*cost)/(stock+qty)`) and never touches `selling_price`/`price_per_kg`. Price-average report aggregates `purchase_items.cost` and `sale_items.unit_price` per period via date_trunc. `cost_at_sale` uses `avg_cost` when it's set.
- Migration: `shop_settings.loyalty_enabled bool default false, loyalty_earn_per numeric default 100, loyalty_point_value numeric default 0.1`; `customers.loyalty_enabled bool default false, loyalty_points numeric default 0`; `loyalty_transactions(customer_id, sale_id, points, kind earn|redeem, store_id, created_by)` with GRANTs and RLS. `sales.points_redeemed`/`points_earned`. Points are applied in the billing flow, and in offline sync when the bill uploads.
- Migration: `user_roles.all_stores boolean default true` plus a new `user_store_access(user_id, store_id)` table with GRANTs and RLS (admin/manager write, self read). Add a security-definer `can_access_store(uid, store_id)` and use it in the store_id-scoped SELECT/INSERT policies so access is enforced in the database, not only in the UI.
- Server fn `setStaffStores` (admin/manager; managers are blocked on admin targets), and `listStaff` returns store access. Store switcher filters by the user's access.
- New `src/lib/print-receipt.ts`: builds receipt HTML (same content as `generateReceipt`: MRP, savings, UPI/invoice QR, Billed by) and prints it through a hidden iframe with `@page { size: 80mm auto }`. `generateReceipt` stays for the PDF download.
- New `src/lib/bill-folder.ts`: `showDirectoryPicker` handle stored in IndexedDB. `generateReceipt` returns a Blob, which is written to the folder after `requestPermission`. Fallback is `showSaveFilePicker`, then the share sheet or a download.
- `billing.tsx` CheckoutDialog: `mode: "none" | "print" | "share"` passed to `onCompleted`. ShareBillDialog gets an editable phone field, a Print button and a normalized `wa.me/91XXXXXXXXXX` link.
- New `BackButton` component (uses `router.history.back()`, falls back to `/dashboard`), shown once in the `_authenticated/route.tsx` layout header so every page has it without editing each page.
- Sonner `<Toaster closeButton />`. Dismiss × added to the dashboard alert banner and the 2-hour low-stock toast.
