create table app_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  email text not null unique check (email = lower(email)),
  first_name text,
  last_name text,
  role text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invitation_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
