-- A pairing code is no longer burned by the first attempt. Redeeming it only creates a
-- provisional device key; the code is removed when that device confirms it really works
-- (it saved the key and completed a first sync). A failed attempt can be repeated with the
-- same code until it expires.

alter table public.mv_device_keys add column if not exists code_hash text;
alter table public.mv_device_keys add column if not exists confirmed boolean not null default true;

create or replace function public.mv_pair_redeem(p_code text, p_key text, p_label text default '')
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
     where p.code_hash = v_hash and p.expires_at > now() and p.used_at is null;
    if v_owner is null then
        return false;
    end if;

    -- a retry replaces the earlier attempt that never got confirmed
    delete from public.mv_device_keys where code_hash = v_hash and not confirmed;
    insert into public.mv_device_keys (key_hash, owner, label, code_hash, confirmed)
    values (encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), v_owner, left(coalesce(p_label, ''), 60), v_hash, false)
    on conflict (key_hash) do nothing;
    return true;
end;
$$;

-- The device proves it works: its key becomes permanent and the code disappears.
create or replace function public.mv_pair_confirm(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_self text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
    v_code text;
    v_found boolean;
begin
    select d.code_hash, true into v_code, v_found from public.mv_device_keys d where d.key_hash = v_self;
    if v_found is null then
        raise exception 'invalid sync key' using errcode = '28000';
    end if;
    update public.mv_device_keys set confirmed = true where key_hash = v_self;
    if v_code is not null then
        delete from public.mv_pairings where code_hash = v_code;
        delete from public.mv_device_keys where code_hash = v_code and not confirmed;
    end if;
    return true;
end;
$$;

revoke all on function public.mv_pair_redeem(text, text, text) from public, anon, authenticated;
revoke all on function public.mv_pair_confirm(text) from public, anon, authenticated;
grant execute on function public.mv_pair_redeem(text, text, text) to anon, authenticated;
grant execute on function public.mv_pair_confirm(text) to anon, authenticated;
