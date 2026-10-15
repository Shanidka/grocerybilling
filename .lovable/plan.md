# Print, WhatsApp share, and Back/Close buttons

Nothing else in billing, stock, reports or settings changes.

## 1. Print bills straight from the app
- The checkout screen gets three buttons: **Complete**, **Complete & Print**, **Complete & Share**.
  - **Complete**: saves the bill only. No download, no print.
  - **Complete & Print**: saves the bill, then opens the browser print window right away with the receipt (80mm thermal size). No trip to Downloads.
  - **Complete & Share**: saves the bill, then opens the share window (see 2).
- After saving, the share window also has a **Print** button, so you can still print later if the customer asks for a paper bill.
- Bill History in Reports gets a **Print** button on each bill too.
- The PDF download stays available as a "Download PDF" link.

## 2. Send the bill on WhatsApp
- The share window has a phone field. It fills in the customer's number if you typed one during billing, and you can change it.
- **Send on WhatsApp** opens WhatsApp (the app on phone, WhatsApp Web/Desktop on PC) with that customer's chat already open. The message is ready: shop name, bill number, total, savings and the online invoice link. You press Send once.
- 10-digit Indian numbers get +91 added automatically. A wrong number shows a warning.
- Limitation: sending with zero taps needs a paid WhatsApp Business API account. This plan uses the free route, which needs that one tap on Send. Auto-send can be added later if you get the Business API.

## 3. Go Back and Close everywhere
- Every page, except Dashboard, gets a **← Back** button at the top. It returns to the page you came from, or to Dashboard if there isn't one.
- Every alert, popup and notification gets a visible **×** Close button, including the low-stock alert, the dashboard alert banner and the pop-up messages.

## Technical details
- New `src/lib/print-receipt.ts`: builds receipt HTML (same content as `generateReceipt`: MRP, savings, UPI/invoice QR, Billed by) and prints it through a hidden iframe with `@page { size: 80mm auto }`. `generateReceipt` stays for the PDF download.
- `billing.tsx` CheckoutDialog: `mode: "none" | "print" | "share"` passed to `onCompleted`. ShareBillDialog gets an editable phone field, a Print button and a normalized `wa.me/91XXXXXXXXXX` link.
- New `BackButton` component (uses `router.history.back()`, falls back to `/dashboard`), shown once in the `_authenticated/route.tsx` layout header so every page has it without editing each page.
- Sonner `<Toaster closeButton />`. Dismiss × added to the dashboard alert banner and the 2-hour low-stock toast.
