# Homesta Stay — DATABASE_SCHEMA.md
## Convenience snapshot — verify against live DB before writing queries

> ⚠️ **WARNING: This file is a snapshot and may be stale.**
> The **live Supabase database** is the authoritative source of truth.
> Always verify table names, column names, types, and enum values against the live DB
> before writing queries. Do not trust this file alone.
>
> To regenerate this file from the live DB, ask: *"Regenerate DATABASE_SCHEMA.md from the live DB."*

**Last synced: 2026-05-26**

---

## Supabase Project

| Key | Value |
|-----|-------|
| URL | `NEXT_PUBLIC_SUPABASE_URL` (env var) |
| Anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (env var, browser-safe) |
| Service role key | `SUPABASE_SERVICE_ROLE_KEY` (env var, server-only — never import in Client Components) |

---

## Enums

All values are exact from the live DB.

### `booking_source_type`
| Value |
|-------|
| `manual` |
| `ota` |
| `agent` |

> ⚠️ No `website` value exists yet. When the website creates bookings directly, clarify with the team which value to use (likely `manual` or a new `website` value to be added).

### `booking_status`
| Value |
|-------|
| `confirmed` |
| `cancelled` |
| `completed` |

> Note: `bookings.status` column is `text`, not this enum. Default is `'hold'` (a plain text value not in the enum). Enum may be used for validation only.

### `business_model_enum`
| Value |
|-------|
| `full_management` |
| `profile_management` |
| `brokerage` |
| `ownership` |
| `other` |

> CLAUDE.md §3 describes the first three. `ownership` and `other` exist in DB but are not active business lines.

### `calendar_block_type`
| Value |
|-------|
| `booked_confirmed` |
| `booked_hold` |
| `external_booking` |
| `manual_block` |
| `maintenance` |
| `out_of_service` |

### `lead_activity_direction`
| Value |
|-------|
| `inbound` |
| `outbound` |

### `lead_activity_type`
| Value |
|-------|
| `call` |
| `whatsapp` |
| `email` |
| `meeting` |
| `note` |
| `file` |
| `stage_change` |

### `lead_cooperation_model`
| Value |
|-------|
| `brokerage` |
| `profile_mgmt` |
| `full_mgmt` |

### `lead_customer_source`
| Value |
|-------|
| `website` |
| `instagram` |
| `booking_com` |
| `airbnb` |
| `referral` |
| `whatsapp` |
| `other` |

### `lead_customer_stage`
| Value |
|-------|
| `new` |
| `inquiring` |
| `quoted` |
| `negotiating` |
| `booked` |
| `confirmed` |
| `lost` |
| `reserved` |
| `paid` |
| `paused` |

### `lead_entity_type`
| Value |
|-------|
| `supplier` |
| `customer` |

### `lead_priority`
| Value |
|-------|
| `low` |
| `medium` |
| `high` |
| `hot` |

### `lead_supplier_source`
| Value |
|-------|
| `referral` |
| `instagram` |
| `website` |
| `cold_call` |
| `walk_in` |
| `whatsapp` |
| `other` |

### `lead_supplier_stage`
| Value |
|-------|
| `new` |
| `contacted` |
| `visit_scheduled` |
| `visited` |
| `negotiating` |
| `contract_sent` |
| `signed` |
| `onboarded` |
| `lost` |
| `paused` |

### `lead_supplier_type`
| Value |
|-------|
| `apartment` |
| `villa` |
| `cabin` |
| `hotel` |
| `hostel` |
| `property_mgmt_co` |
| `building` |
| `other` |

### `lead_task_priority`
| Value |
|-------|
| `low` |
| `normal` |
| `high` |
| `urgent` |

### `lead_task_status`
| Value |
|-------|
| `pending` |
| `completed` |
| `cancelled` |

### `profile_status`
| Value |
|-------|
| `active` |
| `blocked` |
| `unavailable` |
| `other` |

### `property_status_enum`
| Value |
|-------|
| `available` |
| `unavailable` |
| `blocked` |
| `other` |

### `property_type_enum`
| Value |
|-------|
| `building` |
| `hotel` |
| `hostel` |
| `apartment` |
| `villa` |
| `cabin` |
| `resort` |
| `other` |

### `unit_event_type`
| Value |
|-------|
| `booked` |
| `blocked` |
| `hold` |

### `unit_status_enum`
| Value |
|-------|
| `available` |
| `unavailable` |
| `blocked` |
| `other` |

### `unit_style_enum`
| Value |
|-------|
| `practical` |
| `standard` |
| `luxury` |
| `super_luxury` |
| `other` |

### `unit_type_enum`
| Value |
|-------|
| `apartment` |
| `room` |
| `suite` |
| `studio` |
| `villa` |
| `cabin` |
| `farm` |
| `bed` |
| `other` |

### `user_role`
| Value |
|-------|
| `admin` |
| `team` |
| `owner` |
| `broker` |
| `customer` |
| `account` |
| `other` |

> The website only creates/manages `customer` role profiles via Supabase Auth. Other roles are internal.

---

## Public-Facing Tables

These are the only tables the website may read or write. Grouped by cluster.

---

### Properties & Units Cluster

#### `properties`
Parent grouping for units. Read-only from website (owned by owners, created internally).

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `name` | text | NO | — | — |
| `owner_profile_id` | uuid | NO | — | → `profiles.id` |
| `property_type` | user-defined (`property_type_enum`) | NO | `'other'` | — |
| `country` | text | NO | — | — |
| `city` | text | NO | — | — |
| `area` | text | YES | — | — |
| `status` | user-defined (`property_status_enum`) | NO | `'available'` | — |
| `cover_photo_url` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

**Website access:** Read-only.

---

#### `units`
Core listing table. One row per bookable unit.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `property_id` | uuid | NO | — | → `properties.id` |
| `unit_type` | user-defined (`unit_type_enum`) | NO | — | — |
| `unit_name` | text | YES | — | — |
| `unit_number` | text | YES | — | — |
| `status` | user-defined (`unit_status_enum`) | YES | `'available'` | — |
| `business_model` | user-defined (`business_model_enum`) | YES | — | — |
| `unit_style` | user-defined (`unit_style_enum`) | YES | — | — |
| `cancellation_policy_id` | uuid | YES | — | → `unit_cancellation_policy.id` |
| `min_nights` | integer | YES | 1 | — |
| `base_nightly_price` | numeric | YES | — | — |
| `currency` | text | NO | `'USD'` | — |
| `media` | jsonb | YES | `'[]'` | — |
| `media_folder` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> `base_nightly_price` is in USD (per `currency` default). Always treat as USD. `media` (jsonb) is a denormalized cache — prefer querying `unit_media` for images.

**Website access:** Read-only (listing display, search).

---

#### `unit_specifications`
Physical specs for a unit. One-to-one with `units`.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `bedrooms` | integer | YES | — | — |
| `beds` | integer | YES | — | — |
| `bathrooms` | numeric | YES | — | — |
| `floor` | integer | YES | — | — |
| `max_guests` | integer | YES | — | — |
| `size_sqm` | numeric | YES | — | — |
| `balconies` | integer | YES | — | — |
| `kitchens` | integer | YES | — | — |
| `distance_to_mall` | text | YES | — | — |
| `distance_to_transport` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

**Website access:** Read-only.

---

#### `unit_amenities`
Boolean amenity flags for a unit. One-to-one with `units`.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `tv` | boolean | YES | false | — |
| `kitchen` | boolean | YES | false | — |
| `air_conditioning` | boolean | YES | false | — |
| `heating` | boolean | YES | false | — |
| `wifi` | boolean | YES | false | — |
| `washing_machine` | boolean | YES | false | — |
| `dishwasher` | boolean | YES | false | — |
| `hair_dryer` | boolean | YES | false | — |
| `iron` | boolean | YES | false | — |
| `extra_bed` | boolean | YES | false | — |
| `hot_water` | boolean | YES | false | — |
| `parking` | boolean | YES | false | — |
| `elevator` | boolean | YES | false | — |
| `pool` | boolean | YES | false | — |
| `gym` | boolean | YES | false | — |
| `self_check_in` | boolean | YES | false | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

**Website access:** Read-only.

---

#### `unit_info`
Marketing and location text for a unit. One-to-one with `units`.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `ad_title` | text | YES | — | — |
| `ad_description` | text | YES | — | — |
| `country` | text | YES | — | — |
| `city` | text | YES | — | — |
| `region` | text | YES | — | — |
| `municipality` | text | YES | — | — |
| `full_address` | text | YES | — | — |
| `google_maps_url` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> Location fields (`country`, `city`, `region`, `municipality`) are **plain text**, not foreign keys to the `geo_*` tables. See Schema Notes for implications.

**Website access:** Read-only.

---

#### `unit_rules`
House rules for a unit. One-to-one with `units`.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | YES | — | → `units.id` |
| `allow_parties` | boolean | YES | false | — |
| `allow_pets` | boolean | YES | false | — |
| `allow_smoking` | boolean | YES | false | — |
| `quiet_hours_enabled` | boolean | YES | false | — |
| `quiet_hours_from` | time | YES | — | — |
| `quiet_hours_to` | time | YES | — | — |
| `allow_unregistered_guests` | boolean | YES | false | — |
| `family_friendly` | boolean | YES | true | — |
| `id_required` | boolean | YES | true | — |
| `additional_rules` | text | YES | — | — |
| `created_at` | timestamp | YES | now() | — |
| `updated_at` | timestamp | YES | now() | — |

**Website access:** Read-only.

---

#### `unit_media`
Images and media files for a unit. Use this table for queries, not `units.media` (jsonb cache).

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `media_type` | text | NO | — | — |
| `file_path` | text | NO | — | — |
| `public_url` | text | NO | — | — |
| `is_cover` | boolean | YES | false | — |
| `sort_order` | integer | YES | 0 | — |
| `created_at` | timestamp | YES | now() | — |

> Always use `public_url` for display. `file_path` is the Supabase Storage path.

**Website access:** Read-only.

---

#### `unit_availability`
Blocked and available date ranges for a unit.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `start_date` | date | NO | — | — |
| `end_date` | date | NO | — | — |
| `status` | text | NO | — | — |
| `source` | text | NO | — | — |
| `source_reference` | text | YES | — | — |
| `hold_expires_at` | timestamptz | YES | — | — |
| `notes` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

**Website access:** Read-only (to show availability calendar to guests).

---

#### `unit_cancellation_policy`
Lookup table of cancellation policy definitions.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `name` | text | NO | — | — |
| `description` | text | NO | — | — |
| `created_at` | timestamp | YES | now() | — |
| `updated_at` | timestamp | YES | now() | — |

**Website access:** Read-only (display policy on unit detail page).

---

### Pricing Cluster

#### `unit_pricing_rules`
Length-of-stay discount rules (e.g. 7+ nights = 10% off).

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `min_nights` | integer | NO | — | — |
| `max_nights` | integer | YES | — | — |
| `discount_percent` | numeric | NO | 0 | — |
| `is_active` | boolean | NO | true | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

**Website access:** Read-only (calculate final price for guest).

---

#### `unit_pricing_overrides`
Date-range price overrides (e.g. seasonal pricing, special events).

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | NO | — | → `units.id` |
| `start_date` | date | NO | — | — |
| `end_date` | date | NO | — | — |
| `discount_percent` | numeric | YES | — | — |
| `override_price` | numeric | YES | — | — |
| `note` | text | YES | — | — |
| `is_active` | boolean | NO | true | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

> Either `discount_percent` or `override_price` is set, not both. All prices in USD.

**Website access:** Read-only (calculate final price for guest).

---

### Geographic Lookups

Used for search filters and location dropdowns. Note: `unit_info` stores location as **plain text**, not FK references to these tables — see Schema Notes.

#### `geo_countries`

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `name` | text | NO | — | — |
| `iso_code` | text | NO | — | — |
| `is_active` | boolean | NO | true | — |
| `sort_order` | integer | NO | 0 | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

#### `geo_cities`

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `country_id` | uuid | NO | — | → `geo_countries.id` |
| `name` | text | NO | — | — |
| `timezone` | text | YES | — | — |
| `is_active` | boolean | NO | true | — |
| `sort_order` | integer | NO | 0 | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

#### `geo_districts`

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `city_id` | uuid | NO | — | → `geo_cities.id` |
| `name` | text | NO | — | — |
| `is_active` | boolean | NO | true | — |
| `sort_order` | integer | NO | 0 | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

#### `geo_subdistricts`

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `district_id` | uuid | NO | — | → `geo_districts.id` |
| `name` | text | NO | — | — |
| `is_active` | boolean | NO | true | — |
| `sort_order` | integer | NO | 0 | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

**Website access:** Read-only (populate search dropdowns, filter listings).

---

### Currency

#### `currencies`
Live exchange rates for display-time conversion. Never store converted prices.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `code` | text | NO | — | — |
| `name` | text | NO | — | — |
| `symbol` | text | NO | — | — |
| `rate_to_usd` | numeric | NO | — | — |
| `is_active` | boolean | NO | true | — |
| `is_base` | boolean | NO | false | — |
| `sort_order` | integer | NO | 0 | — |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> Always multiply `base_nightly_price` (USD) by `rate_to_usd` at render time. Never persist the result.

**Website access:** Read-only.

---

### Guest Auth & Profiles

#### `profiles`
Extends Supabase `auth.users`. All Homesta users — guests, team, owners — have a row here.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | — | → `auth.users.id` (implicit, managed by Supabase Auth) |
| `first_name` | text | YES | — | — |
| `last_name` | text | YES | — | — |
| `birth_date` | date | YES | — | — |
| `nationality` | text | YES | — | — |
| `phone` | text | YES | — | — |
| `email` | text | YES | — | — |
| `role` | user-defined (`user_role`) | NO | `'account'` | — |
| `status` | user-defined (`profile_status`) | NO | `'active'` | — |
| `photo_url` | text | YES | — | — |
| `photo_version` | integer | NO | 0 | — |
| `created_at` | timestamptz | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> The website only creates and reads profiles with `role = 'customer'`. Other roles (`admin`, `team`, `owner`, `broker`) are internal and must never be assigned or exposed by the public site.

**RLS:** A guest reads and writes only their own row (`auth.uid() = id`).
**Website access:** Read own row; create row on sign-up (via Supabase Auth trigger).

---

### Bookings & Customers

#### `customers`
CRM record for a guest who has booked. May or may not have a Supabase Auth account.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `first_name` | text | NO | — | — |
| `last_name` | text | NO | — | — |
| `full_name` | text | YES | — | — |
| `birth_date` | date | YES | — | — |
| `nationality` | text | YES | — | — |
| `id_type` | text | YES | — | — |
| `id_type_other` | text | YES | — | — |
| `id_number` | text | YES | — | — |
| `email` | text | YES | — | — |
| `phone` | text | YES | — | — |
| `notes` | text | YES | — | — |
| `created_at` | timestamptz | YES | now() | — |
| `created_by` | uuid | YES | — | — |
| `updated_at` | timestamptz | YES | now() | — |
| `updated_by` | uuid | YES | — | — |

> `created_by` / `updated_by` reference profile IDs. When the website creates a customer record, these will be the guest's own profile ID.

**Website access:** Read own record; create on booking (with guest's own details).

---

#### `bookings`
Core booking record. Created when a guest confirms a booking on the website.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `unit_id` | uuid | YES | — | → `units.id` |
| `customer_id` | uuid | YES | — | → `customers.id` |
| `booking_reference` | text | YES | — | — |
| `check_in` | date | NO | — | — |
| `check_out` | date | NO | — | — |
| `nights` | integer | YES | — | — |
| `guests_count` | integer | YES | — | — |
| `status` | text | YES | `'hold'` | — |
| `source_type` | user-defined (`booking_source_type`) | YES | `'manual'` | — |
| `source_note` | text | YES | — | — |
| `channel_id` | uuid | YES | — | → `channels.id` |
| `created_by` | uuid | YES | — | — |
| `notes` | text | YES | — | — |
| `hold_duration_minutes` | integer | YES | — | — |
| `cancelled_reason` | text | YES | — | — |
| `created_at` | timestamp | YES | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> `status` is plain `text` (not the `booking_status` enum). Possible values include `'hold'` (default), `'confirmed'`, `'cancelled'`, `'completed'`. Confirm with team before writing status values.
> `source_type` has no `website` value in the current enum — confirm which value to use when the website creates bookings directly.

**RLS:** Guest reads only their own bookings (`auth.uid()` linked via `customer_id` → `customers` → `profiles`).
**Website access:** Read own bookings; create on booking confirmation.

---

### Customer Leads

#### `leads_customers`
Created when a guest inquires via the website (`source = 'website'`). Separate from a confirmed booking.

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|----|
| `id` | uuid | NO | gen_random_uuid() | — |
| `stage` | user-defined (`lead_customer_stage`) | NO | `'new'` | — |
| `source` | user-defined (`lead_customer_source`) | YES | — | — |
| `priority` | user-defined (`lead_priority`) | NO | `'medium'` | — |
| `contact_name` | text | NO | — | — |
| `phone` | text | YES | — | — |
| `email` | text | YES | — | — |
| `nationality` | text | YES | — | — |
| `guests_count` | integer | YES | — | — |
| `check_in_date` | date | YES | — | — |
| `check_out_date` | date | YES | — | — |
| `budget_min` | numeric | YES | — | — |
| `budget_max` | numeric | YES | — | — |
| `budget_currency` | text | YES | — | — |
| `preferred_districts` | ARRAY | YES | — | — |
| `preferences_notes` | text | YES | — | — |
| `notes` | text | YES | — | — |
| `lost_reason` | text | YES | — | — |
| `converted_to_booking_id` | uuid | YES | — | → `bookings.id` |
| `whatsapp_number` | text | YES | — | — |
| `instagram_handle` | text | YES | — | — |
| `tags` | ARRAY (text[]) | YES | `'{}'` | — |
| `preferred_language` | text | YES | — | — |
| `contact_id` | uuid | YES | — | → `contacts.id` |
| `assigned_to_profile_id` | uuid | YES | — | → `profiles.id` |
| `created_by_profile_id` | uuid | YES | — | → `profiles.id` |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | YES | now() | — |

> When the website creates a lead: set `source = 'website'`, `stage = 'new'`. Do NOT set `assigned_to_profile_id` (the team assigns internally). Do NOT set `contact_id` (linked internally via CRM).

**Website access:** Write (create new lead on guest inquiry); no read needed from public site.

---

## Off-Limits Tables

The following tables exist in the DB but **must never be touched** by the public website codebase. Listed by exact name.

### Finance
| Table | Reason |
|-------|--------|
| `accounts` | Internal accounting/ledger accounts |
| `financial_transactions` | All financial transaction records |

### Supplier CRM
| Table | Reason |
|-------|--------|
| `leads_suppliers` | Supplier acquisition pipeline — internal only |
| `leads_suppliers_with_stats` | DB view of leads_suppliers with computed stats |

### CRM Infrastructure
| Table | Reason |
|-------|--------|
| `leads_activities` | Activity log for both lead types — internal CRM |
| `leads_assignments` | Lead assignment history — internal CRM |
| `leads_tasks` | CRM task management — internal only |
| `lead_tags` | Tag definitions for CRM leads |
| `leads_customers_with_stats` | DB view of leads_customers with computed stats |

### Team & Owner Internal
| Table | Reason |
|-------|--------|
| `team_members` | Internal team roster |
| `users` | Internal user records (separate from `profiles`) |
| `owners` | Property owner records with financial/payout data |

### Internal Calendar & Sync
| Table | Reason |
|-------|--------|
| `calendar` | Internal booking calendar — managed by staff |
| `unit_events` | Internal unit event records |
| `unit_ical_feeds` | iCal sync feeds — internal sync tooling |

### Internal Chat / Messaging
| Table | Reason |
|-------|--------|
| `chat_channels` | Internal messaging channel configuration |
| `chat_conversations` | Internal staff conversations |
| `chat_conversations_with_context` | DB view of chat_conversations |
| `chat_messages` | Internal chat messages |
| `chat_templates` | Internal chat message templates |
| `contacts` | CRM contacts linked to chat conversations |
| `contacts_with_classification` | DB view of contacts with CRM classification |

### Booking Channels (Internal Reference)
| Table | Reason |
|-------|--------|
| `channels` | Booking channel definitions (OTA, direct, etc.) — set server-side, not chosen by guests |

---

## RLS Summary

| Table | Anon read | Auth (customer) read | Auth (customer) write | Notes |
|-------|-----------|---------------------|----------------------|-------|
| `units` | ✅ | ✅ | ❌ | Public listings |
| `unit_specifications` | ✅ | ✅ | ❌ | |
| `unit_amenities` | ✅ | ✅ | ❌ | |
| `unit_info` | ✅ | ✅ | ❌ | |
| `unit_rules` | ✅ | ✅ | ❌ | |
| `unit_media` | ✅ | ✅ | ❌ | |
| `unit_availability` | ✅ | ✅ | ❌ | |
| `unit_cancellation_policy` | ✅ | ✅ | ❌ | |
| `unit_pricing_rules` | ✅ | ✅ | ❌ | |
| `unit_pricing_overrides` | ✅ | ✅ | ❌ | |
| `properties` | ✅ | ✅ | ❌ | |
| `geo_*` (all 4) | ✅ | ✅ | ❌ | |
| `currencies` | ✅ | ✅ | ❌ | |
| `profiles` | ❌ | Own row only | Own row only | Via Supabase Auth |
| `customers` | ❌ | Own record only | Create on booking | |
| `bookings` | ❌ | Own bookings only | Create on confirm | |
| `leads_customers` | ❌ | ❌ | Create (inquiry) | No read needed by website |

> ⚠️ These RLS rules are intended/expected. Verify actual policies in Supabase dashboard before writing queries — they may differ.

---

## Schema Notes & Quirks

1. **Units ↔ Geo mismatch:** `unit_info` stores location as plain text (`city`, `region`, `municipality`) — NOT as FK references to `geo_countries`/`geo_cities`/`geo_districts`. The geo tables are primarily used by the supplier CRM. Search/filter by city on the website requires text-matching `unit_info.city` against `geo_cities.name`, or a separate search layer.

2. **`bookings.status` is plain text, not the enum:** The `booking_status` enum exists (`confirmed`, `cancelled`, `completed`) but `bookings.status` column is `text` with a default of `'hold'`. Confirm the full list of valid status values with the team before writing any booking status logic.

3. **No `website` value in `booking_source_type`:** The enum only has `manual`, `ota`, `agent`. When the website creates bookings directly, confirm with the team which value to use (or whether `website` will be added).

4. **`units.media` vs `unit_media` table:** `units.media` is a jsonb denormalization cache. Always use the `unit_media` table for image queries — it has proper structure (`is_cover`, `sort_order`, `public_url`).

5. **`profiles` is shared across all user types:** Guests (`customer`), staff (`team`, `admin`), owners (`owner`), and brokers all share the `profiles` table. The website only touches `customer`-role profiles. Never assign any other role from the public website.

6. **`business_model_enum` has 5 values:** The live DB includes `ownership` and `other` in addition to the three documented in CLAUDE.md §3. These are not active business lines — treat units with these values as read-only edge cases until further guidance.

7. **Timestamps:** Some tables use `timestamp with time zone` and some use `timestamp without time zone`. Always use `timestamptz` (with timezone) for any new values written by the website.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-26 | Initial population from live DB schema export |
