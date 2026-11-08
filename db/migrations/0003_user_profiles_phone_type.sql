alter table user_profiles add column phone_type text check (phone_type in ('personal','work','home'));
