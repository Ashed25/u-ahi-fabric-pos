import type { SupabaseClient } from '@supabase/supabase-js'
import { getSetting } from '../db/settings'
import type { CloudApi } from './engine'

/** Run once in the Supabase SQL editor. One table holds every row; each shop only sees its own rows. */
export const SETUP_SQL = `create sequence if not exists pos_rows_seq;

create table if not exists pos_rows (
  shop uuid not null default auth.uid() references auth.users on delete cascade,
  tbl text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  device text,
  seq bigint not null default nextval('pos_rows_seq'),
  updated_at timestamptz not null default now(),
  primary key (shop, tbl, id)
);
create index if not exists pos_rows_shop_seq on pos_rows (shop, seq);

-- every insert/update: owner = the signed-in shop, new change number, time
create or replace function pos_rows_touch() returns trigger language plpgsql as $$
begin
  new.shop := auth.uid();
  new.seq := nextval('pos_rows_seq');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pos_rows_touch on pos_rows;
create trigger pos_rows_touch before insert or update on pos_rows
  for each row execute function pos_rows_touch();

-- the signed-in shop may use the table and take change numbers
grant select, insert, update on pos_rows to authenticated;
grant usage, select on sequence pos_rows_seq to authenticated;

alter table pos_rows enable row level security;
drop policy if exists pos_rows_own on pos_rows;
create policy pos_rows_own on pos_rows for all to authenticated
  using (shop = auth.uid()) with check (shop = auth.uid());`

let cached: { url: string; client: SupabaseClient } | undefined

/** The Supabase client is loaded only on devices that use the cloud. */
export async function getClient(): Promise<SupabaseClient | undefined> {
  const [url, key] = [await getSetting('cloudUrl'), await getSetting('cloudAnonKey')]
  if (!url || !key) return undefined
  if (cached?.url === url) return cached.client
  const { createClient } = await import('@supabase/supabase-js')
  cached = { url, client: createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'u-ahi-cloud-auth' } }) }
  return cached.client
}

export function supabaseApi(client: SupabaseClient, device: string): CloudApi {
  const rows = () => client.from('pos_rows')
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    return data
  }
  return {
    async upsert(list) {
      check(await rows().upsert(list.map((r) => ({ ...r, device })), { onConflict: 'shop,tbl,id', defaultToNull: false }))
    },
    async pull(after, limit) {
      return check(await rows().select('tbl,id,data,deleted,seq').gt('seq', after).order('seq').limit(limit)) ?? []
    },
    async getMeta(id) {
      const r = check(await rows().select('data').eq('tbl', '_meta').eq('id', id).maybeSingle())
      return (r?.data as Record<string, unknown>) ?? undefined
    },
    async setMeta(id, data) {
      check(await rows().upsert({ tbl: '_meta', id, data, deleted: false, device }, { onConflict: 'shop,tbl,id', defaultToNull: false }))
    },
  }
}

/** The ready-to-use API for this device, or undefined when the cloud isn't set up / not signed in. */
export async function cloudApi(): Promise<CloudApi | undefined> {
  const client = await getClient()
  if (!client) return undefined
  const { data } = await client.auth.getSession()
  if (!data.session) return undefined
  return supabaseApi(client, (await getSetting('deviceUuid')) || 'unknown')
}
