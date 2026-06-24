# Maintenance Taxonomy Cloud Handoff

## Current Data Flow

- Maintenance entries are active records in `fueltracker-maintenance-entries-v3` and sync to the Supabase `maintenance` table.
- The existing `public.maintenance` table is the entry table and should not be recreated. It already has `stable_key`, `updated_at`, `deleted_at`, and `version`.
- Maintenance taxonomy now has local normalization and optional cloud sync helpers:
  - `fueltracker-maintenance-categories-v1` stores category/subcategory definitions.
  - `fueltracker-maintenance-systems-v1` stores main systems and their category ID lists.
  - `fueltracker-maintenance-settings-v2` stores defaults and per-category rules.
- Built-in category seeds live in `src/data/maintenanceCategories.js`.
- Runtime state and mutations live in `src/hooks/state/useMaintenanceState.js`.
- Main editing UI lives in `src/components/Maintenance.jsx`.
- Add/edit maintenance entry UI reads taxonomy from `maintenanceSystems` and `getCategoryById`.
- Cloud sync can optionally upload/download maintenance systems and categories/subcategories when the taxonomy tables exist.
- Taxonomy sync writes sparse vehicle-scoped cloud rows for every non-deleted vehicle during manual upload/merge.
- Default hardcoded taxonomy is not uploaded or counted as a diff unless the user customizes systems/categories/settings.
- Local taxonomy is still one shared app-level ruleset, so cloud download merges taxonomy from all vehicles and prefers the active vehicle's copy when duplicate stable keys exist.
- If the taxonomy tables are not installed yet, the app skips taxonomy sync and keeps normal entry sync working.
- Per-category defaults are mapped into `maintenance_subcategories.default_distance` and `default_safety`.
- System/category rename and category assignment changes now carry `updatedAt`/`updated_at` and `version` locally.
- New custom category creation now uses `makeMaintenanceTypeKey()` so new category IDs are semantic, for example `timing_belt`, not `custom_123`.

## Draft Schema Artifact

- Draft SQL file: `supabase/maintenance_taxonomy_draft.sql`
- Status: draft only, not applied.
- Tables drafted:
  - `maintenance_systems`
  - `maintenance_subcategories`
- The draft also includes optional maintenance entry link columns:
  - `subcategory_stable_key`
  - `subcategory_type_key`
  - `system_stable_key`
  - `subcategory_name_snapshot`
- These optional columns are for linking existing maintenance entries to taxonomy later. They should be applied only with matching app code. The current app can keep using `maintenance.type` as the readable subcategory type key during the first taxonomy migration.

## Recommended Next Session Checklist

1. Confirm taxonomy scope before applying schema:
   - Current cloud behavior is vehicle-scoped taxonomy, synced for all non-deleted vehicles.
   - Current local behavior is one shared taxonomy ruleset.
   - Legacy/user-level rows with `vehicle_id = null` should be converted or ignored after vehicle-scoped rows exist.
2. Review `maintenance_taxonomy_draft.sql` against the live Supabase schema. Do not recreate or replace `public.maintenance`.
3. Decide whether RLS should expose tombstoned taxonomy rows for recovery/sync:
   - Current draft allows selecting all user-owned rows, including `deleted_at`.
   - Normal app queries should filter active rows in code.
4. Local taxonomy normalization is implemented:
   - Generate `stableKey/stable_key` for systems and categories.
   - Add `typeKey/type_key` for categories using `makeMaintenanceTypeKey()`.
   - Preserve existing type keys on rename.
5. Cloud sync helpers are partially implemented:
   - fetch user-level taxonomy
   - upsert user-level systems
   - upsert user-level subcategories
   - skip gracefully when tables are absent
6. Remaining: implement idempotent seed/migration:
   - Seed hardcoded systems/categories only when missing.
   - Upload local custom systems/categories to cloud.
   - Do not resurrect soft-deleted defaults.
7. Remaining cloud sync hardening:
   - tombstone systems/subcategories
   - merge by `stable_key`, fallback by `type_key`
   - add taxonomy to detailed diff/conflict UI if needed
8. Startup/manual sync order now includes taxonomy opportunistically:
   - vehicles
   - taxonomy systems/subcategories
   - maintenance entries
9. Remaining: update maintenance entry upload/download mapping after optional columns are applied:
   - keep `maintenance.type` as readable type key
   - optionally write taxonomy link/snapshot fields
   - display from taxonomy first, then snapshot, then safe fallback.
10. Validate manually:
   - create custom system/category on device A
   - sync and retrieve on device B
   - create `Timing Belt` and confirm type key is `timing_belt`
   - rename/delete categories and confirm history stays readable
   - repeat sync/startup and confirm no duplicates

## Prompt For Next Chat

Continue the maintenance taxonomy cloud-sync work. Start by reviewing `docs/maintenance-taxonomy-cloud-handoff.md` and `supabase/maintenance_taxonomy_draft.sql`. Do not apply SQL until the current Supabase schema is checked. Implement this in checkpoints: local normalization first, then schema review/application, then idempotent migration, then cloud sync helpers, then UI rendering from synced taxonomy. Do not push without confirmation.
