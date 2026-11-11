-- Manual down (local/disposable DB only; revert code reading the column first):
-- begin;
-- alter table app_users drop column clerk_deleted_user_id;
-- delete from schema_migrations where name = '0005_app_users_clerk_deleted_user_id.sql';
-- commit;
alter table app_users add column clerk_deleted_user_id text;
