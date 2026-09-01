-- Реестр блогеров — начало базы.
-- Собрано по решениям 01–02.09.2026, разбор — в ../../voprosy-i-dyry.md
--
-- Главное про модерацию (решение 02.09): поля карточки разрезаны на два сорта.
-- Что не влияет на доверие — ник, фото, ссылки, тематика, ставка, язык —
-- правится сразу. Цифры и скрин уходят на проверку отдельной строкой в
-- pravki_cifr, а в каталоге до одобрения висят старые.

-- ------------------------------------------------------------------ люди

create table lyudi (
  id              bigserial primary key,
  telefon         text not null unique,        -- личность: один человек = одна запись
  rol             text not null default 'blogger'
                    check (rol in ('blogger', 'moderator', 'admin')),
  imya            text,
  zaveden_v       timestamptz not null default now(),
  poslednii_vhod  timestamptz
);

comment on table lyudi is 'Все, кто входит. Телефон наружу не отдаётся никогда.';

-- --------------------------------------------------------------- справочники

create table tematiki (
  id        bigserial primary key,
  nazvanie  text not null unique,
  vidna     boolean not null default true,     -- скрываем, а не удаляем
  poryadok  integer not null default 0
);

create table goroda (
  id        bigserial primary key,
  nazvanie  text not null unique,
  vidno     boolean not null default true
);

create table rayony (
  id        bigserial primary key,
  gorod_id  bigint not null references goroda(id) on delete cascade,
  nazvanie  text not null,
  vidno     boolean not null default true,
  unique (gorod_id, nazvanie)
);

-- ------------------------------------------------------------------ картинки
-- Решение 02.09: храним в базе, а не на диске. Диск Railway не попадает в
-- резервную копию и теряется при пересоздании службы. При загрузке ужимаем.

create table kartinki (
  id            bigserial primary key,
  vid           text not null check (vid in ('foto', 'skrin')),
  tip           text not null,                 -- image/jpeg
  bayty         bytea not null,
  razmer        integer not null,
  zagruzhena_v  timestamptz not null default now()
);

-- ----------------------------------------------------------------- карточки

create table kartochki (
  id               bigserial primary key,
  chelovek_id      bigint not null unique references lyudi(id) on delete cascade,
  nik              text not null default '',
  foto_id          bigint references kartinki(id) on delete set null,

  -- цифры: меняются только через проверку, когда карточка уже в каталоге
  podpischiki      integer,
  ohvat            integer,
  istochnik        text not null default 'words'
                     check (istochnik in ('screen', 'words')),

  gorod_id         bigint references goroda(id) on delete set null,
  rayon_id         bigint references rayony(id) on delete set null,
  yazyk            text,
  stavka           integer,
  dogovornaya      boolean not null default false,

  status           text not null default 'draft'
                     check (status in ('draft', 'moderation', 'published', 'rejected')),
  prichina_otkaza  text,

  sozdana_v        timestamptz not null default now(),
  obnovlena_v      timestamptz not null default now(),
  podana_v         timestamptz,
  opublikovana_v   timestamptz
);

comment on column kartochki.status is 'В каталог попадают только published';

create index kartochki_status_idx on kartochki (status);
create index kartochki_gorod_idx  on kartochki (gorod_id);
create index kartochki_podp_idx   on kartochki (podpischiki desc);

create table kartochka_tematiki (
  kartochka_id  bigint not null references kartochki(id) on delete cascade,
  tematika_id   bigint not null references tematiki(id) on delete restrict,
  primary key (kartochka_id, tematika_id)
);

create table ssylki (
  id            bigserial primary key,
  kartochka_id  bigint not null references kartochki(id) on delete cascade,
  adres         text not null,
  ploshchadka   text not null,                 -- instagram, tiktok… по домену
  unique (kartochka_id, adres)
);

create table skriny (
  id            bigserial primary key,
  kartochka_id  bigint not null references kartochki(id) on delete cascade,
  kartinka_id   bigint not null references kartinki(id) on delete cascade,
  otchet_ii     jsonb,                         -- место под ИИ-чтение, пока пусто
  zagruzhen_v   timestamptz not null default now()
);

-- ------------------------------------------------------- правка цифр на проверке
-- Живёт, только пока карточка уже опубликована и человек поменял цифры.

create table pravki_cifr (
  id               bigserial primary key,
  kartochka_id     bigint not null references kartochki(id) on delete cascade,
  podpischiki      integer,
  ohvat            integer,
  skrin_id         bigint references skriny(id) on delete set null,
  istochnik        text not null default 'words'
                     check (istochnik in ('screen', 'words')),
  status           text not null default 'moderation'
                     check (status in ('moderation', 'approved', 'rejected')),
  prichina_otkaza  text,
  podana_v         timestamptz not null default now(),
  reshena_v        timestamptz
);

-- одна открытая правка на карточку, иначе очередь превращается в кашу
create unique index pravki_odna_otkrytaya
  on pravki_cifr (kartochka_id)
  where status = 'moderation';

-- --------------------------------------------------------------- приглашения

create table priglasheniya (
  id              bigserial primary key,
  token           text not null unique,
  chelovek_id     bigint not null references lyudi(id) on delete cascade,
  godno_do        timestamptz not null,
  ispolzovano_v   timestamptz,                 -- пусто — ещё живо
  kem_vydano      bigint references lyudi(id) on delete set null,
  sozdano_v       timestamptz not null default now()
);

create index priglasheniya_chelovek_idx on priglasheniya (chelovek_id);

-- ------------------------------------------------------------------ сессии
-- Срок 60 дней — слово владельца 02.09. Храним отпечаток, не саму cookie.

create table sessii (
  id           bigserial primary key,
  chelovek_id  bigint not null references lyudi(id) on delete cascade,
  otpechatok   text not null unique,
  godna_do     timestamptz not null,
  sozdana_v    timestamptz not null default now()
);

create index sessii_chelovek_idx on sessii (chelovek_id);

-- ------------------------------------------------------------ журнал модерации

create table zhurnal_moderatsii (
  id            bigserial primary key,
  kartochka_id  bigint references kartochki(id) on delete set null,
  kto_id        bigint references lyudi(id) on delete set null,
  chto          text not null
                  check (chto in ('odobril', 'otklonil', 'popravil', 'udalil', 'zavel')),
  prichina      text,
  kogda         timestamptz not null default now()
);

create index zhurnal_kartochka_idx on zhurnal_moderatsii (kartochka_id);

-- ------------------------------------------------------------- сырые строки CRM
-- Чтобы разбор таблицы заказчика можно было прогнать заново, не выпрашивая файл.

create table crm_syrye (
  id           bigserial primary key,
  stroka       jsonb not null,
  chelovek_id  bigint references lyudi(id) on delete set null,
  zamechanie   text,                           -- почему не разобрали
  vzyato_v     timestamptz not null default now()
);
