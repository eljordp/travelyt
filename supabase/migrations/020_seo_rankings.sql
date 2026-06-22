create table if not exists public.seo_rankings (
  id text primary key,
  query text not null,
  city text,
  device text not null default 'desktop' check (device in ('desktop', 'mobile')),
  intent text not null default 'service' check (intent in ('service', 'city', 'airport', 'partner', 'brand')),
  target_url text,
  rank integer check (rank is null or (rank >= 1 and rank <= 100)),
  ranking_url text,
  local_pack boolean not null default false,
  serp_feature text,
  source text not null default 'seed' check (source in ('seed', 'baseline', 'manual', 'monitor', 'gsc')),
  notes text,
  checked_at timestamptz not null default now(),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists seo_rankings_set_updated_at on public.seo_rankings;
create trigger seo_rankings_set_updated_at
before update on public.seo_rankings
for each row
execute function public.set_updated_at();

create index if not exists seo_rankings_city_device_idx
  on public.seo_rankings (city, device);

create index if not exists seo_rankings_rank_idx
  on public.seo_rankings (rank);

create index if not exists seo_rankings_checked_at_idx
  on public.seo_rankings (checked_at desc);

alter table public.seo_rankings enable row level security;
revoke all on public.seo_rankings from anon, authenticated;

insert into public.seo_rankings
  (id, query, city, device, intent, target_url, notes, sort_order)
values
  (
    'jfk-luggage-pickup-delivery',
    'JFK luggage pickup and delivery',
    'New York',
    'desktop',
    'airport',
    '/cities/jfk',
    'Primary JFK service-intent term. Track organic rank and map pack separately.',
    10
  ),
  (
    'jfk-luggage-delivery-hotel',
    'luggage delivery to hotel NYC',
    'New York',
    'mobile',
    'city',
    '/cities/jfk',
    'Mobile local-intent query for travelers already near the airport or hotel.',
    20
  ),
  (
    'lax-luggage-delivery',
    'LAX luggage delivery service',
    'Los Angeles',
    'desktop',
    'airport',
    '/cities/lax',
    'Track when the LAX city page starts earning airport-specific impressions.',
    30
  ),
  (
    'ord-luggage-delivery',
    'ORD luggage delivery service',
    'Chicago',
    'desktop',
    'airport',
    '/cities/ord',
    'Track Chicago airport demand before expanding ORD content further.',
    40
  ),
  (
    'airport-luggage-delivery-service',
    'airport luggage delivery service',
    null,
    'desktop',
    'service',
    '/quote',
    'General service term. Good for measuring whether the core offer is legible.',
    50
  ),
  (
    'airport-baggage-courier',
    'airport baggage courier service',
    null,
    'desktop',
    'service',
    '/quote',
    'Courier language may convert better for business and official travel contexts.',
    60
  ),
  (
    'luggage-pickup-near-me',
    'luggage pickup near me',
    null,
    'mobile',
    'service',
    '/quote',
    'Local-pack-sensitive query. Only call a win if Travelyt appears in the actual local pack.',
    70
  ),
  (
    'airline-luggage-handoff',
    'airline luggage handoff service',
    null,
    'desktop',
    'partner',
    '/airlines',
    'Partner-adjacent term. Keep claims bounded unless an airline relationship is real.',
    80
  )
on conflict (id) do nothing;
