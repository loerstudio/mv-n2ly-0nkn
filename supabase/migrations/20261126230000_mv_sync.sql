-- Mattana Vita sync store. One row per record (destination, checkpoint, metric, zone, decision, focus session, settings),
-- scoped to an owner. Nothing is reachable through the table API: clients only call the
-- mv_* functions below, and every call needs a per-device key.
--
-- A device earns its key by redeeming a one-time pairing code (8 characters) created by an
-- already-connected device. The very first code is inserted by hand (see personal/ scripts, not in this repo).

create table public.mv_keys (
    owner      text primary key,
    created_at timestamptz not null default now()
);

create table public.mv_records (
    owner       text    not null references public.mv_keys (owner),
    id          text    not null,
    kind        text    not null,
    data        jsonb,
    deleted     boolean not null default false,
    modified_ms bigint  not null,
    device_id   text collate "C" not null default '',
    updated_us  bigint  not null,
    primary key (owner, id)
);

create index mv_records_owner_updated on public.mv_records (owner, updated_us, id);

create table public.mv_device_keys (
    key_hash   text primary key,
    owner      text not null references public.mv_keys (owner),
    label      text not null default '',
    created_at timestamptz not null default now()
);

create table public.mv_pairings (
    code_hash  text primary key,
    owner      text not null references public.mv_keys (owner),
    expires_at timestamptz not null,
    used_at    timestamptz
);

-- Redeem attempts, so a code can't be guessed by brute force.
create table public.mv_pair_attempts (
    at timestamptz not null default now()
);

alter table public.mv_keys enable row level security;
alter table public.mv_records enable row level security;
alter table public.mv_device_keys enable row level security;
alter table public.mv_pairings enable row level security;
alter table public.mv_pair_attempts enable row level security;
revoke all on table public.mv_keys from anon, authenticated;
revoke all on table public.mv_records from anon, authenticated;
revoke all on table public.mv_device_keys from anon, authenticated;
revoke all on table public.mv_pairings from anon, authenticated;
revoke all on table public.mv_pair_attempts from anon, authenticated;

-- Which owner a device key opens.
create function public.mv_resolve_owner(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select d.owner
      from public.mv_device_keys d
     where d.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
$$;
revoke all on function public.mv_resolve_owner(text) from public, anon, authenticated;

-- Last write wins per record: a row only changes when the incoming edit is newer
-- (ties broken by device id, the same rule the app applies locally).
create function public.mv_push(p_key text, p_records jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner text := public.mv_resolve_owner(p_key);
    v_count integer;
begin
    if v_owner is null then
        raise exception 'invalid sync key' using errcode = '28000';
    end if;

    insert into public.mv_records as w (owner, id, kind, data, deleted, modified_ms, device_id, updated_us)
    select v_owner,
           r ->> 'id',
           r ->> 'kind',
           case when coalesce((r ->> 'deleted')::boolean, false) then null else r -> 'data' end,
           coalesce((r ->> 'deleted')::boolean, false),
           (r ->> 'modified_ms')::bigint,
           coalesce(r ->> 'device_id', ''),
           (extract(epoch from clock_timestamp()) * 1000000)::bigint
    from jsonb_array_elements(p_records) as r
    on conflict (owner, id) do update
        set kind        = excluded.kind,
            data        = excluded.data,
            deleted     = excluded.deleted,
            modified_ms = excluded.modified_ms,
            device_id   = excluded.device_id,
            updated_us  = (extract(epoch from clock_timestamp()) * 1000000)::bigint
        where (w.modified_ms, w.device_id) < (excluded.modified_ms, excluded.device_id);

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

create function public.mv_pull(
    p_key text,
    p_after_us bigint default 0,
    p_after_id text default '',
    p_limit integer default 500
)
returns table (id text, kind text, data jsonb, deleted boolean, modified_ms bigint, device_id text, updated_us bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_owner text := public.mv_resolve_owner(p_key);
begin
    if v_owner is null then
        raise exception 'invalid sync key' using errcode = '28000';
    end if;

    return query
        select w.id, w.kind, w.data, w.deleted, w.modified_ms, w.device_id::text, w.updated_us
        from public.mv_records w
        where w.owner = v_owner
          and (w.updated_us, w.id) > (p_after_us, p_after_id)
        order by w.updated_us, w.id
        limit least(greatest(p_limit, 1), 1000);
end;
$$;

-- A connected device asks for a code to hand to a new one (valid 15 minutes).
create function public.mv_pair_create(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner    text := public.mv_resolve_owner(p_key);
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_code     text := '';
    i          integer;
begin
    if v_owner is null then
        raise exception 'invalid sync key' using errcode = '28000';
    end if;
    for i in 1..8 loop
        v_code := v_code || substr(v_alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    delete from public.mv_pairings where expires_at < now() - interval '1 day';
    insert into public.mv_pairings (code_hash, owner, expires_at)
    values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_owner, now() + interval '15 minutes');
    return v_code;
end;
$$;

-- A new device trades a code for the right to use the key it generated itself.
create function public.mv_pair_redeem(p_code text, p_key text, p_label text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_code  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
    v_hash  text := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
    v_owner text;
begin
    delete from public.mv_pair_attempts where at < now() - interval '1 hour';
    if (select count(*) from public.mv_pair_attempts where at > now() - interval '1 minute') >= 10 then
        raise exception 'Troppi tentativi. Aspetta un minuto e riprova.' using errcode = '54000';
    end if;
    insert into public.mv_pair_attempts default values;

    if length(coalesce(p_key, '')) < 32 then
        raise exception 'invalid device key' using errcode = '22023';
    end if;

    select p.owner into v_owner
      from public.mv_pairings p
     where p.code_hash = v_hash and p.expires_at > now() and p.used_at is null
       for update;
    if v_owner is null then
        return false;
    end if;

    update public.mv_pairings set used_at = now() where code_hash = v_hash;
    insert into public.mv_device_keys (key_hash, owner, label)
    values (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), v_owner, left(coalesce(p_label, ''), 60))
    on conflict (key_hash) do nothing;
    return true;
end;
$$;

-- "Lost my phone": every other device is cut off, this one keeps working.
create function public.mv_revoke_others(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_owner text := public.mv_resolve_owner(p_key);
    v_self  text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
    v_count integer;
begin
    if v_owner is null then
        raise exception 'invalid sync key' using errcode = '28000';
    end if;
    delete from public.mv_device_keys where owner = v_owner and key_hash <> v_self;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke all on function public.mv_push(text, jsonb) from public, anon, authenticated;
revoke all on function public.mv_pull(text, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.mv_pair_create(text) from public, anon, authenticated;
revoke all on function public.mv_pair_redeem(text, text, text) from public, anon, authenticated;
revoke all on function public.mv_revoke_others(text) from public, anon, authenticated;
grant execute on function public.mv_push(text, jsonb) to anon, authenticated;
grant execute on function public.mv_pull(text, bigint, text, integer) to anon, authenticated;
grant execute on function public.mv_pair_create(text) to anon, authenticated;
grant execute on function public.mv_pair_redeem(text, text, text) to anon, authenticated;
grant execute on function public.mv_revoke_others(text) to anon, authenticated;
