# Future Improvements Plan

This file tracks the next planned work after the sync, backup/export, lint, and Data Health checkpoint.

## Current Progress Snapshot

- Phase 0 is code-complete. Manual QA passed except verifying that reminders reappear only after cooldown/status/due-data changes.
- Phase 1 is code-complete. Manual QA passed except the system/subcategory undo toast copy, which has been fixed and needs quick retest.
- Phase 2 is code-complete. Manual iPhone/PWA shell layout QA passed.
- Phase 3 was completed earlier. Manual maintenance entry flow QA passed.
- No push should happen until the current unpushed changes are manually tested and explicitly approved.

## Guiding Rules

- Keep risky maintenance logic changes in their own checkpoints.
- Do not push without explicit confirmation.
- Prefer read-only/diagnostic UI before adding destructive or syncing behavior.
- After each meaningful batch, run lint and build before deciding whether to continue.
- Manual QA is owned by the user unless explicitly requested.

## Phase 0: Notification Spam Prevention And Settings

Risk: Medium  
Priority: Highest

- [x] Stop repeated maintenance reminder notifications for the same item/status.
- [x] Add persistent notification history/cooldown storage, for example `fueltracker-notification-history-v1`.
- [x] Dedupe by maintenance item and state:
  - due soon
  - overdue
- [x] Only notify again when:
  - state changes, such as due soon -> overdue
  - cooldown expires, such as 24 hours or user-configured period
  - relevant odometer/due data meaningfully changes
- [x] Add a main notification master switch in Settings.
- [x] Keep maintenance notifications controlled under the main notification switch.
- [x] Add clear Settings text explaining what notifications are enabled/disabled.
- [x] Verify on iPhone/PWA that repeated app opens, sync refreshes, and background/foreground transitions do not spam duplicate notifications.
- [ ] Verify reminder can appear again only after cooldown, status change, or due odometer data change.
- [x] Run lint/build.

## Phase 1: Cloud Merge And Maintenance Data Integrity Bugs

Risk: High  
Priority: Highest

- [x] Fix cloud sync merge so it never replaces an entry's real date/timestamp with Supabase `created_at`.
- [x] Audit merge-from-cloud for fill-ups and maintenance entries to preserve user-entered dates and calculation-critical fields.
- [ ] Add regression checks for stats/consumption calculations after merge-from-cloud.
- [x] Make new maintenance systems transactional in the edit modal:
  - do not save newly added systems when the user clicks Cancel
  - save only after explicit confirmation
  - prevent adding duplicate system names for the same vehicle
- [x] Implement undo/soft-delete behavior across maintenance:
  - systems
  - subcategories
  - maintenance entries
- [x] Hide deleted systems consistently everywhere, including the add maintenance entry page.
- [x] When logging maintenance for a custom/new subcategory, prefill from that subcategory's saved distance and safety margin instead of hardcoded defaults.
- [x] Remove the main/global default maintenance distance from Maintenance Settings; distance defaults should come from the selected category/subcategory.
- [x] Fix distance and safety margin numeric inputs so users can fully clear the field while editing instead of being forced back to `0`.
- [x] Verify maintenance dashboard, settings, add maintenance entry, edit maintenance entry, cloud sync, and recovery after these fixes.
- [ ] Retest system/subcategory delete undo toast copy after the label fix.
- [x] Run lint/build.

## Phase 2: Mobile PWA Shell Layout Fix

Risk: Medium  
Priority: Highest

- [x] Fix bottom navigation shifting upward when scrolling to the bottom on iPhone/PWA.
- [x] Keep the top vehicle/header bar fixed and visible on every screen.
- [x] Make the middle content area the only scrollable region between the fixed top header and fixed bottom nav.
- [x] Reserve safe spacing with iPhone safe-area handling:
  - `env(safe-area-inset-top)`
  - `env(safe-area-inset-bottom)`
- [x] Avoid fragile `100vh` behavior where it conflicts with iOS dynamic viewport behavior; prefer stable app-shell sizing with `100dvh` fallback strategy.
- [x] Verify Dashboard, History, Stats, Settings, Maintenance, add fill-up, and modals on mobile/PWA.
- [x] Run lint/build.

## Manual Testing Steps For Current Checkpoint

Use these steps before approving a push.

### A. Notification Spam Prevention

Status: Passed except cooldown/status-change reappearance timing, which needs time to verify.

1. [x] Open Settings and confirm the main app notification switch is visible.
2. [x] Turn notifications off and confirm maintenance reminders do not send.
3. [x] Turn notifications on and make sure only the expected due-soon/overdue reminder appears.
4. [x] Close and reopen the PWA several times.
5. [x] Switch app background/foreground several times.
6. [x] Confirm the same Oil Change/Air Filter reminder does not appear repeatedly within a short period.
7. [ ] Confirm a reminder can appear again only after its cooldown, status change, or due odometer data change.

### B. Cloud Merge Date Integrity

Status: Passed.

1. [x] Note the dates of several fill-ups in History and Stats.
2. [x] Use Manual Sync > Merge Data.
3. [x] Confirm the fill-up dates remain the original user-entered dates, not the Supabase upload/created date.
4. [x] Confirm AVG KM/L, L/100KM, cost/km, charts, and history ordering still look correct.
5. [x] Repeat with Manual Sync > Download from Cloud if you have safe cloud data to compare.

### C. Maintenance Settings And Category Rules

Status: Passed except step 10 copy. The undo behavior worked; toast copy has been fixed and needs retest.

1. [x] Go to Maintenance > Settings.
2. [x] Confirm the old Defaults / Safety Margin card is gone.
3. [x] Open a system edit modal.
4. [x] Add a new system, then press Cancel. Confirm it is not saved.
5. [x] Add a new system again, press Save. Confirm it appears.
6. [x] Try adding another system with the same name. Confirm duplicate names are blocked.
7. [x] Add a custom subcategory to a system with a custom distance and safety margin.
8. [x] Open Add Maintenance and choose that subcategory.
9. [x] Confirm the form uses the custom distance/safety values, not hardcoded defaults.
10. [ ] Delete a system or subcategory and confirm the undo toast can restore it and shows system/subcategory copy.
11. [x] Let the undo toast expire and confirm deleted systems no longer appear in Add Maintenance.
12. [x] In distance/safety inputs, delete the full value and confirm the field can become empty while editing.

### D. Maintenance Entry Flow

Status: Passed.

1. [x] Add a maintenance entry for a tracked category.
2. [x] Confirm it appears in Maintenance overview, History, and the item detail modal.
3. [x] Edit the entry and confirm previous values are prefilled.
4. [x] Delete it and confirm undo restores it.
5. [x] Delete it again and let the timer expire.
6. [x] Confirm the entry disappears from normal UI and sync/recovery behavior remains correct.

### E. Mobile PWA Shell Layout

Status: Passed.

1. [x] Install/open the app as a PWA on iPhone.
2. [x] Test Dashboard, History, Stats, Settings, Maintenance, Add Fill-up, and Add Maintenance.
3. [x] Scroll each screen to the bottom.
4. [x] Confirm the bottom nav stays fixed at the bottom and does not float upward.
5. [x] Confirm the top vehicle/header bar remains fixed and visible.
6. [x] Confirm content scrolls only between the header and bottom nav.
7. [x] Confirm form action buttons do not overlap the bottom nav or iPhone home indicator.
8. [x] Open modals such as Manual Sync, Maintenance system edit, and item detail; confirm they are usable and not clipped.

## Phase 3: Maintenance Forecast And Reminder Improvements

Risk: High  
Priority: Highest

- [x] Audit current dashboard due-soon logic, maintenance overview status logic, and notification settings.
- [x] Make due-soon and overdue checks consistently use active `maintenanceEntries`.
- [x] Base reminder status on:
  - latest maintenance entry per category
  - current odometer
  - interval km
  - safety margin km
  - enabled/disabled category setting
- [x] Improve estimated due date using the all-entry average daily distance calculation.
- [x] Show clear states in maintenance item details:
  - notifications off
  - watching
  - due soon
  - overdue
- [x] Ensure dashboard Due Soon card and Maintenance overview agree.
- [x] Keep time-based recurring reminders as a later phase unless the odometer-based flow is fully stable.
- [x] Run lint/build.
- [ ] Manual QA:
  - add tracked maintenance
  - edit interval/safety
  - disable category
  - verify dashboard, maintenance overview, and detail modal all match

## Phase 4: Data Health V2

Risk: Medium  
Priority: High

- [x] Make Data Health items expandable or clickable.
- [x] Show affected dates/entries for each issue group.
- [ ] Add actions:
  - open affected fill-up
  - open affected maintenance entry
  - ignore/dismiss warning locally
- [ ] Add maintenance-specific checks:
  - missing odometer
  - missing category/system mapping
  - duplicate maintenance records
  - deleted/tombstoned records still visible
  - entries with null key fields that may sync incorrectly
- [ ] Add sync/taxonomy checks:
  - custom system exists locally but not cloud
  - custom category exists locally but not cloud
  - maintenance entry has no category/system cloud mapping
- [ ] Run lint/build.

## Phase 5: Backup And Import Polish V2

Risk: Medium  
Priority: Medium-High

- [ ] Add a post-import summary modal.
- [ ] Show:
  - imported records
  - skipped identical records
  - merged records
  - conflicts resolved
  - settings restored
- [ ] Improve backup preview labels for:
  - maintenance systems
  - maintenance subcategories
  - maintenance settings
  - app preferences
- [ ] Add schema compatibility messaging:
  - older backup detected
  - newer backup detected
  - partial backup detected
- [ ] Confirm JSON and Excel remain equivalent in coverage.
- [ ] Run lint/build.

## Phase 6: Manual Sync Modal V2

Risk: Medium  
Priority: Medium

- [ ] Add expandable details under each changed group.
- [ ] Show readable examples such as:
  - system renamed
  - category added
  - category rule edited
  - fill-up changed
  - maintenance entry tombstoned
- [ ] Clearly separate:
  - cloud-only changes
  - local-only changes
  - both-changed conflicts
  - deletions
- [ ] Keep the hidden-control refresh-click behavior unchanged unless explicitly requested.
- [ ] Run lint/build.

## Phase 7: Maintenance PDF And Export Refinement

Risk: Medium  
Priority: Medium

- [ ] Add saved PDF presets.
- [ ] Add preview count before export:
  - number of entries
  - selected systems
  - selected columns
- [ ] Add grouped-by-system PDF option.
- [ ] Add all/active vehicle selection if useful.
- [ ] Ensure custom system and subcategory names display correctly in:
  - add maintenance entry
  - maintenance history
  - PDF export
  - Excel/JSON export
- [ ] Run lint/build.

## Phase 8: Localization Cleanup

Risk: Low  
Priority: Medium

- [ ] Move new hard-coded English strings into i18n.
- [ ] Add Arabic translations for:
  - Data Health panel
  - backup format explanation
  - import review summary
  - sync detail labels
  - PDF selection indicators
- [ ] Check RTL layout for the updated modals/panels.
- [ ] Run lint/build.

## Phase 9: Mobile Input UX

Risk: Low  
Priority: Medium

- [x] Use iPhone-friendly numeric keyboards for shared numeric `Input` fields:
  - whole-number fields use `inputMode="numeric"`
  - decimal fields use `inputMode="decimal"`
- [ ] Audit future raw `<input type="number">` additions so they do not bypass the shared behavior.
- [ ] Manually QA on iPhone/PWA for:
  - fill-up odometer
  - liters
  - fuel cost
  - maintenance odometer/interval/safety/cost
  - tire calculator
  - trip estimator

## Phase 10: Later Product Improvements

Risk: Medium to High  
Priority: Later

- [ ] Fuel forecast:
  - next fill-up estimate
  - monthly fuel spend estimate
  - remaining range when tank capacity is known
- [ ] Station insights:
  - best/worst station by price
  - best/worst station by efficiency
  - favorite stations
- [ ] Maintenance planner:
  - upcoming service timeline
  - projected service dates
  - maintenance cost forecast
- [ ] Better chart annotations:
  - outlier markers
  - plain-language trend summaries
  - monthly comparisons

## Next Recommended Start

After manual QA and push approval, start with **Phase 4: Data Health V2** if you want the safest visible improvement next, or **Phase 6: Manual Sync Modal V2** if sync clarity becomes more urgent. Keep those separate from backup/import and maintenance sync model work.
