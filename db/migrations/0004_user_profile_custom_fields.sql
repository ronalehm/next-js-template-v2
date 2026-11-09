create table user_profile_custom_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  label text not null check (
    char_length(label) between 1 and 40
    and label = btrim(label)
    and label !~ '[[:cntrl:]]'
    and label !~ '\s\s'
  ),
  value text not null check (
    char_length(value) between 1 and 200
    and value = btrim(value)
    and value !~ '[[:cntrl:]]'
  ),
  position smallint not null check (position between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profile_custom_fields_position_key
    unique (user_id, position) deferrable initially immediate
);

create unique index user_profile_custom_fields_label_key
  on user_profile_custom_fields (user_id, lower(label));
