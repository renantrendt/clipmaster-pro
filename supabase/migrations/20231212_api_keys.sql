-- Create API Keys table
create table api_keys (
  id uuid default uuid_generate_v4() primary key,
  key text not null unique,
  type text not null check (type in ('free', 'pro')),
  user_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_request bigint,
  is_active boolean default true
);

-- Create API Usage table
create table api_usage (
  id uuid default uuid_generate_v4() primary key,
  api_key_id uuid references api_keys(id),
  timestamp bigint not null,
  count integer default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes
create index idx_api_keys_key on api_keys(key);
create index idx_api_usage_timestamp on api_usage(timestamp);
create index idx_api_usage_api_key_id on api_usage(api_key_id);

-- Create RLS policies
alter table api_keys enable row level security;
alter table api_usage enable row level security;

-- Policies for api_keys
create policy "Users can view their own API keys"
  on api_keys for select
  using (auth.uid()::text = user_id);

-- Policies for api_usage
create policy "Users can view their own API usage"
  on api_usage for select
  using (
    api_key_id in (
      select id from api_keys
      where user_id = auth.uid()::text
    )
  );
