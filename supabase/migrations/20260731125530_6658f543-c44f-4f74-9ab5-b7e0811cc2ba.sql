alter table public.partners
  add column if not exists logo_url text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

update public.partners set
  address = 'Av. Paulista, 1500 - Bela Vista, São Paulo - SP',
  lat = -23.561414, lng = -46.655881,
  phone = '+551130000001'
where name = 'Posto Forte';

update public.partners set
  address = 'Av. Rebouças, 900 - Pinheiros, São Paulo - SP',
  lat = -23.565312, lng = -46.678210,
  phone = '+551130000002'
where name = 'Rede Pneus';

update public.partners set
  address = 'R. Augusta, 2100 - Consolação, São Paulo - SP',
  lat = -23.556080, lng = -46.662510,
  phone = '+551130000003'
where name = 'Lava Rápido';

update public.partners set
  address = 'Av. Brigadeiro Faria Lima, 1200 - Jardim Paulistano, São Paulo - SP',
  lat = -23.577340, lng = -46.688120,
  phone = '+551130000004'
where name = 'Oficina Top';

update public.partners set
  address = 'Av. Ipiranga, 200 - República, São Paulo - SP',
  lat = -23.544940, lng = -46.641600,
  phone = '+551130000005'
where name = 'Seguro Anjo';

create index if not exists partners_location_idx on public.partners (lat, lng) where active;