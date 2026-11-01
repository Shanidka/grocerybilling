<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Store access is enforced in the database via `can_access_store()` on store-scoped SELECT policies (stores, products, sales, customers) and the `staff_store_scope` table; no row = all stores. Why: UI filtering alone can be bypassed.
- Receipts: `generateReceipt(r, "save"|"print"|"blob")` is the single receipt builder; printing uses a hidden iframe, saving goes through `saveBillFile` (folder handle in IndexedDB). Why: one layout for print, PDF and reprints.
- Loyalty balances change only through `loyalty_transactions` inserts (trigger updates customers.loyalty_points). Why: auditable points history.
- Purchases update `products.avg_cost` via trigger and never touch selling price. Why: loose items keep one fixed selling price.
- Billing favourites are stored on each store and edited through its existing manager/admin write policy; billing reads cached store data. Why: shared picks stay store-specific and remain available offline.
- Voice recognition is instantiated only after a microphone action and populates search, never the cart. Why: browser support varies and ambiguous product names require a biller choice.
- Loyalty customer history and membership use shared customer queries and a shared program-settings control. Why: Customers, Loyalty and Settings must stay consistent.
- Customer credit caps are optional and enforced by a sales trigger; credit rejections must never become offline bills. Why: UI checks and network fallback cannot bypass configured limits.
- Cash counts are immutable store/day snapshots submitted through an authorized RPC, with India-time boundaries and manager-only expected totals. Why: closing records must be auditable and cashier submissions must not disclose expected amounts.
- Loyalty navigation inherits Customers access until an explicit Loyalty page permission is configured. Why: adding a page must not hide it from existing customer-access designations.
