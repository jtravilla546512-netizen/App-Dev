# QR Library Cards and Book-Copy Labels

## Purpose

The system assigns a persistent QR value to every member account and every physical book copy. These codes support the future web-based circulation workflow without placing passwords, email addresses, or loan history inside a QR code.

## Member QR library card

- The Android member app displays a digital library card in **Profile**.
- The QR value begins with `RCJK-MEMBER-`.
- A librarian scans it from **Circulation desk** in the web sidebar to look up the member.
- If a member does not have a working phone, the librarian can still search or enter the member ID manually.

## Book-copy QR label

- Every physical copy, including copies of the same title, has its own QR value.
- The QR value begins with `RCJK-COPY-`.
- In the web admin panel, open **Books**, choose a title, then use **View label** for a copy.
- Print the displayed label and attach it to that particular physical copy.

## Security rule

A QR code identifies an account or copy. It does not prove identity and does not authorize borrowing by itself. During circulation, the librarian must still verify the member shown by the system and confirm the transaction.

## Current scope

The source now includes the dedicated **Circulation desk** at `/circulation`, camera QR scanning and manual member-ID/copy-accession lookup. The deployed site only gains this page after the updated frontend is pushed and deployed.

## Borrow and return workflow

1. Choose **Borrow a book** or **Return a book**.
2. Scan the member QR or type the member ID and select **Look up member**. Verify the displayed person against their identity/card.
3. Scan the physical copy QR or type its accession number and select **Look up copy**.
4. For borrowing, choose a future due date/time. For returns, inspect the copy and select good or damaged.
5. Check the verification checkbox, then explicitly confirm. Scanning never changes inventory by itself.

The API rechecks permissions, account status, availability, overdue restrictions and the member/copy pairing inside a transaction. Duplicate returns and competing copy allocations are rejected. A stale or failed submission requires fresh lookups before trying again. Existing pending requests are reused for desk issuance.

## Overdue penalty

There is no monetary fine. A member with any unreturned copy past its due timestamp cannot submit another borrow request or receive another loan, including through the old approval page. Returning **all** overdue copies restores eligibility automatically, subject to the normal active-loan limit. The restriction does not prevent signing in, reading notifications, viewing history, or returning books.

## Camera and offline fallback

- Use HTTPS (or localhost) and permit camera access. A browser-supported laptop/USB webcam is sufficient; no librarian Android app is needed.
- A keyboard-style scanner can enter the QR value into either lookup field.
- Camera denial/unavailability does not block manual entry.
- Members do not need Wi-Fi: use a printed card, saved QR screenshot, or manual member ID. The librarian’s computer must remain online to confirm against the live database.
- No camera images or video are uploaded or stored. QR values are identifiers, never login credentials.

## Verification boundary

API tests and an isolated browser borrow/return test pass. Physical webcam scanning and the installed Android member QR still need device acceptance testing after deployment/rebuild.
