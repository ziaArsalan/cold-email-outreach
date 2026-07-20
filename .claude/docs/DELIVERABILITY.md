# Deliverability — DNS, plain-text policy, warm-up

Cold email lives or dies on inbox placement. This doc is the operator playbook:
authenticate every sending domain (SPF/DKIM/DMARC), keep messages plain-text
with a single link, and ramp volume slowly.

The sending domains for Devtronics are **meetdevtronics.com** and
**devtronics.co**. Everything below has copy-pasteable records for both.

---

## Why plain-text + one link

The app enqueues **plain-text** bodies by default. No HTML part is fabricated
from the text unless a campaign explicitly opts in (`campaign.htmlEnabled`), and
the send code sets an `html` MIME part **only** when one is supplied — see
`server/services/smtp/NodemailerProvider.js` (`buildMailOptions`).

`server/services/deliverabilityService.js` (`validateBody`) enforces the content
rules at **enqueue time** (`campaignService.start`), so a bad template is
rejected before a single message is queued:

- **Body must be non-empty.**
- **At most one link** across the whole body+signature. Put your single CTA/link
  in the signature. Multiple links are the #1 spam-filter trigger for cold mail.
- **No images** — no Markdown `![alt](url)`, no `<img>` tags, no `data:` URIs.

Rationale: text/plain with one link mimics a real 1:1 email, aligns with SPF/DKIM
cleanly (no tracking-pixel domains), and avoids the image/link ratios filters
score against.

---

## SPF

One TXT record per domain, host `@`. Namecheap Private Email uses
`spf.privateemail.com`.

```
v=spf1 include:spf.privateemail.com ~all
```

| Domain             | Type | Host | Value                                        |
|--------------------|------|------|----------------------------------------------|
| meetdevtronics.com | TXT  | `@`  | `v=spf1 include:spf.privateemail.com ~all`   |
| devtronics.co      | TXT  | `@`  | `v=spf1 include:spf.privateemail.com ~all`   |

Notes:
- Exactly **one** SPF record per domain. If you already have a `v=spf1` TXT,
  merge the `include:` into it rather than adding a second record.
- `~all` (soft-fail) while ramping; tighten to `-all` once verified clean.

---

## DKIM

Namecheap Private Email signs with DKIM once you enable it in the panel:

**Private Email → Domain → Email → DKIM → Enable.** The panel then shows the TXT
record to publish. The selector is `default`, so the record host is
`default._domainkey.<domain>`.

Publish the value the panel gives you. Copy-paste shape (replace the value with
the exact string from the panel — it is a single long `p=` public key):

```
Host:  default._domainkey.meetdevtronics.com
Type:  TXT
Value: v=DKIM1; k=rsa; p=<PASTE_PUBLIC_KEY_FROM_PRIVATE_EMAIL_PANEL>
```

```
Host:  default._domainkey.devtronics.co
Type:  TXT
Value: v=DKIM1; k=rsa; p=<PASTE_PUBLIC_KEY_FROM_PRIVATE_EMAIL_PANEL>
```

After publishing, confirm DKIM is green in the Private Email panel and that a
test message shows `dkim=pass`.

---

## DMARC (starter)

Start in monitor-only mode (`p=none`) so you get reports without risking
delivery. One TXT record per domain, host `_dmarc`.

| Domain             | Type | Host     | Value                                                                 |
|--------------------|------|----------|-----------------------------------------------------------------------|
| meetdevtronics.com | TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@meetdevtronics.com`               |
| devtronics.co      | TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@meetdevtronics.com`               |

```
v=DMARC1; p=none; rua=mailto:dmarc@meetdevtronics.com
```

**Tighten after 2–4 clean weeks:** once aggregate reports show SPF+DKIM aligned
and passing, move `p=none` → `p=quarantine` (and later `p=reject`).

---

## Warm-up guidance

Ramp each **mailbox** slowly. The app models this in `server/config` as
`warmupWeeks`, and `mailboxService.effectiveDailyCap` caps a mailbox's daily
sends to the current warm-up week's `max` while `warmupEnabled` is on.

| Week | Sends/day per mailbox | config.warmupWeeks |
|------|-----------------------|--------------------|
| 1    | 5–10                  | `{ min: 5,  max: 10 }` |
| 2    | 10–20                 | `{ min: 10, max: 20 }` |
| 3    | 20–30                 | `{ min: 20, max: 30 }` |
| 4    | 40–50                 | `{ min: 40, max: 50 }` |

Guidance:
- These caps are **per mailbox**. Add mailboxes (with rotation) to scale total
  volume rather than pushing any single box past its cap.
- Keep `SEND_MODE=warmup` (longer inter-send delays) during the ramp.
- Reply to and engage with your own early sends to build sender reputation.
- A cold domain should start at week 1 even if the mailbox is old.

---

## Unsubscribe handling

Every outgoing email carries a **one-click unsubscribe** — a footer link plus
RFC 8058 headers. Both are attached at **send time** by
`server/services/unsubscribeService.js`, not stored in templates.

**Why this helps rather than hurts deliverability.** Since Feb 2024 Gmail and
Yahoo expect bulk senders to offer one-click unsubscribe, and `List-Unsubscribe`
is a positive reputation signal: it gives a recipient an exit that isn't the
**Report spam** button, and spam complaints are what actually burn a domain. It
is also required by CAN-SPAM. The link is `https://` on your own sending domain
(not a redirect/tracker), which is what keeps it spam-filter-safe.

How it works:

- The URL is `${PUBLIC_BASE_URL}/api/unsubscribe?t=<leadId>.<HMAC>`, signed with
  `JWT_SECRET`. Nothing is stored and the link can't be guessed or enumerated.
- Headers sent on every message:
  `List-Unsubscribe: <mailto:you@domain?subject=unsubscribe>, <https://…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- `POST /api/unsubscribe` is the one-click endpoint Gmail/Yahoo call directly.
  `GET /api/unsubscribe` is the human link and returns a confirmation page.
  Both are **public** (recipients aren't logged in) — they sit above
  `requireAuth` in `routes/api.js`.
- Either one sets the lead to **`unsubscribed`**, **cancels every pending or
  scheduled queue item for that lead** (so the whole follow-up sequence stops
  immediately), and writes a `SendLog` entry. The scheduler also re-checks lead
  status before each send, so an opt-out mid-sequence is honored.
- The footer link is exempt from the one-link rule in `validateBody` because it
  is added after validation — the template still gets its own single CTA link.

**`PUBLIC_BASE_URL` must be a real, internet-reachable origin before you send
for real.** The default falls back to `http://localhost:PORT`, which in a
delivered email is a dead link — that blocks opt-outs and hurts deliverability.

A reply-based opt-out (*"just reply 'no thanks'"*) can be offered too, but it
can't be actioned automatically — you must mark those leads `unsubscribed`
by hand.
