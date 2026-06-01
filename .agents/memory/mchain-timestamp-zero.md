---
name: MChain block.timestamp=0 bug
description: block.timestamp is always 0 on MChain 1888; timestamp-based flags are unreliable; use explicit bool fields.
---

## Rule
Never rely on `block.timestamp` for distinguishing state on MChain 1888 — it returns 0 for all blocks.

## Why
MChain test network returns `block.timestamp = 0` on every block. Any struct field set to `block.timestamp` (e.g. `lockedSince = block.timestamp`) will be 0 for both "set" and "unset" states, making it impossible to distinguish locked vs flexible stakes, or whether a timestamp was ever written.

## How to apply
- Use explicit `bool` flag fields in structs instead of using a nonzero timestamp as a sentinel (e.g. `bool isLockedFlag` instead of checking `lockedSince != 0`).
- Still store the timestamp field for UI display purposes, but for logic/branching always gate on the bool.
- When reading `getActiveStakes`, map `isLockedFlags[i]` → set `lockedSince = 1` (truthy) so frontend `isFlexible()` check (`lockedSince === 0`) still works correctly.
- Applied fix: `StakePosition.isLockedFlag` (bool) added; `executeConvertToLocked` sets `isLockedFlag = true`; `AlreadyLocked` check uses `pos.isLockedFlag` not `pos.lockedSince != 0`.
