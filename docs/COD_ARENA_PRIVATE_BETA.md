# Gament COD Arena — Private Beta

## Product decisions

- Regions: Global and Garena are isolated at profile, room and rank level.
- Phase 1: Battle Royale custom rooms (Solo, Duo, Squad), 2–100 entries.
- Rewards: operator-configurable Kill, placement and participation components.
- Referral: a configurable percentage of Gament's service fee only; the prize budget is never reduced.
- Financial mode: `COD_ARENA_LIVE=false` and `COD_ARENA_FINANCE_APPROVED=false` by default. Both independent switches are required; entry debit, prize payout and COD referral events are shadow-only otherwise.

## Secure room lifecycle

```text
draft → registration → check_in → lobby_open → in_progress → settling → completed
                                 ↘ cancelled
```

Unsafe status jumps are rejected. Once the first entry exists, region, entry fee and service fee are locked.

## Player flow

1. Set COD UID, in-game name and Global/Garena in `/profile/edit`.
2. Open `/cod-arena` and inspect capacity, dates, rules and exact reward formula.
3. Accept the versioned rules and join.
4. Check in during the configured window.
5. Room code/password/official COD invite URL are withheld until reveal time and only shown to checked-in entries/staff/admins.
6. Upload scoreboard or recording evidence.
7. An operator verifies results and runs one idempotent settlement.
8. Shadow rewards, COD rank and shadow referral shares are recorded.

## Operations

`/admin/cod-arena` provides:

- room creation and safe lifecycle controls;
- Global/Garena, Solo/Duo/Squad, map and perspective;
- entry fee, service fee and prize budget;
- Kill/placement/participation reward configuration;
- Roomer, Spectator and Judge assignment;
- result entry and evidence-gated settlement;
- private/public beta publication.

## Financial invariants

- Monetary values are integer Rial (`numeric(20,0)`).
- Service fee cannot exceed entry fee.
- Published room prize budget must cover conservative maximum reward liability.
- Final settlement cannot exceed the configured prize budget.
- Referral is calculated only from service fee:

```text
commission = service_fee × referral_rate_bps / 10,000
```

- One COD affiliate event per room entry.
- 30-day first-touch attribution remains unchanged.
- Self-referral remains blocked.
- A referred user can create at most three COD commission events per 24 hours.
- Refund/cancelled eligibility invalidates a live commission.

## Evidence and anti-cheat

Evidence supports profile, scoreboard, player recording, lobby recording and dispute records. Optional SHA-256 content hashes prevent reuse inside a room. Rooms marked `requires_recording` cannot be settled without at least one scoreboard/recording/lobby-recording record.

The first trust/safety layer is now available:

- players/staff can file room reports for cheat, teaming, no recording, banned item, toxic behavior, wrong result, no-show or other;
- admins review reports in `/admin/cod-reports`;
- admins can resolve/reject reports and optionally apply warning, fine, temporary ban, permanent ban or result-void penalties;
- active temporary/permanent bans block future COD Arena joins.

This is the foundation, not the final anti-cheat layer. Cancellation refunds are atomic, but before public money is enabled add a treasury-backed prize-budget reserve, direct upload, malware-safe media processing, OCR, COD-specific dispute holds, a formal lobby-recorder workflow, device review protocol, two QA financial cycles and legal approval.
