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

There is **no `List-Unsubscribe` header infrastructure yet**. Opt-outs are
handled manually:

- When a prospect asks to opt out, set the lead's status to **`unsubscribed`**
  (a value in the Lead status enum). The scheduler will not target
  `unsubscribed` leads.
- Include a plain reply-to-opt-out line in the signature, e.g.
  *"Not the right time? Just reply 'no' and I won't follow up."* This is honest,
  low-friction, and keeps the body plain-text with no extra links.
- Honor every opt-out promptly — mark the lead `unsubscribed` and cancel any
  queued items for it.
