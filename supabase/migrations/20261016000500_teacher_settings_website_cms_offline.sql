-- OFFLINE/UNAPPLIED migration DRAFT: Requires review before applying.
-- No browser/anon grants: draft content, admin settings, and storage keys must
-- never be exposed through base-table public SELECT or unreviewed views.
-- Production database adapter/RPC must add authenticated, teacher-scoped writes,
-- atomic revision compare-and-swap, snapshot publication and audit events.

create table public.teacher_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  phone text,
  avatar_media_id uuid,
  updated_at timestamptz not null default now(),
  constraint teacher_profiles_name_size check (char_length(trim(display_name)) between 2 and 160),
  constraint teacher_profiles_bio_size check (char_length(bio) <= 1200),
  constraint teacher_profiles_phone_size check (phone is null or char_length(phone) between 7 and 20)
);
create table public.teacher_preferences (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system',
  locale text not null default 'en',
  email_notifications boolean not null default true,
  push_notifications boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint teacher_preferences_theme check (theme in ('light','dark','system')),
  constraint teacher_preferences_locale check (locale in ('en','bn'))
);
create table public.app_settings (
  id smallint primary key default 1 check (id=1),
  draft_revision bigint not null default 1 check (draft_revision >= 1),
  published_revision bigint check (published_revision is null or published_revision <= draft_revision),
  draft_content jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_content)='object'),
  published_content jsonb check (published_content is null or jsonb_typeof(published_content)='object'),
  changed_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table public.media_assets (
  id uuid primary key,
  storage_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  alt text not null,
  status text not null default 'ready',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint cms_media_type check (content_type in ('image/jpeg','image/png','image/webp','image/avif')),
  constraint cms_media_size check (size_bytes between 1 and 5242880),
  constraint cms_media_sha check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint cms_media_status check (status in ('ready','archived')),
  constraint cms_media_alt check (char_length(trim(alt)) between 2 and 200)
);
alter table public.teacher_profiles add constraint teacher_profile_avatar_fk
  foreign key (avatar_media_id) references public.media_assets(id) on delete restrict;
create table public.site_pages (
  id uuid primary key,
  slug text not null unique,
  title text not null,
  seo_title text not null,
  seo_description text not null default '',
  status text not null default 'draft',
  draft_revision bigint not null default 1,
  published_revision bigint,
  published_snapshot jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint cms_page_slug check (slug ~ '^[a-z][a-z0-9-]{1,62}$'),
  constraint cms_page_status check (status in ('draft','published','archived')),
  constraint cms_page_revisions check (draft_revision>=1 and (published_revision is null or published_revision<=draft_revision)),
  constraint cms_page_snapshot check ((published_revision is null and published_snapshot is null) or
     (published_revision is not null and published_snapshot is not null and jsonb_typeof(published_snapshot)='object')),
  constraint cms_page_title check (char_length(trim(title)) between 2 and 160),
  constraint cms_page_seo check (char_length(trim(seo_title)) between 2 and 160 and char_length(seo_description)<=300)
);
create table public.site_page_sections (
  id uuid primary key,
  page_id uuid not null references public.site_pages(id) on delete restrict,
  kind text not null,
  sort_order integer not null,
  heading text not null default '',
  body text not null default '',
  visible boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint cms_section_kind check (kind in ('hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer')),
  constraint cms_section_order check (sort_order between 0 and 1000),
  constraint cms_section_sizes check (char_length(heading)<=160 and char_length(body)<=6000)
);
create index site_sections_page_order_idx on public.site_page_sections(page_id,sort_order);
create table public.site_section_items (
  id uuid primary key,
  section_id uuid not null references public.site_page_sections(id) on delete restrict,
  sort_order integer not null,
  title text not null default '',
  description text not null default '',
  media_id uuid references public.media_assets(id) on delete restrict,
  link_url text,
  visible boolean not null default true,
  constraint cms_item_order check (sort_order between 0 and 1000),
  constraint cms_item_sizes check (char_length(title)<=160 and char_length(description)<=2000 and
    (link_url is null or char_length(link_url)<=2048))
);
create index site_items_section_order_idx on public.site_section_items(section_id,sort_order);
create index site_pages_status_slug_idx on public.site_pages(status,slug);

alter table public.teacher_profiles enable row level security;
alter table public.teacher_preferences enable row level security;
alter table public.app_settings enable row level security;
alter table public.media_assets enable row level security;
alter table public.site_pages enable row level security;
alter table public.site_page_sections enable row level security;
alter table public.site_section_items enable row level security;

-- Fail closed. Never grant browser permissions on draft-heavy CMS base tables.
-- Reviewed RPCs and public published-snapshot API must be installed separately.
revoke all on public.teacher_profiles, public.teacher_preferences,
  public.app_settings, public.media_assets, public.site_pages,
  public.site_page_sections, public.site_section_items from anon, authenticated;
-- NOTE: teacher-specific read/RPC policy, snapshot reader, and Supabase Storage
-- policy are intentionally NOT installed by this offline draft.
