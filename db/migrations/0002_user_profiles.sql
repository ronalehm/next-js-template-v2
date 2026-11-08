create table user_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  phone text check (char_length(phone) <= 30),
  job_title text check (char_length(job_title) <= 100),
  company text check (char_length(company) <= 100),
  birthday date check (birthday >= date '1900-01-01'),
  website text check (char_length(website) <= 200),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
