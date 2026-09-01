"""Наливка и уборка выдуманных данных для показа каталога.

    py app/tools/test-dannye.py --nalit   — заполнить 60 заготовок и опубликовать
    py app/tools/test-dannye.py --ubrat   — вернуть их в черновики и вычистить

Зачем отдельным ключом. Ники в таблице заказчика настоящие, а цифры мы
придумываем. Показать такое заказчику как есть — обмануть его: он решит, что
у @nick правда 168 тысяч подписчиков. Поэтому наливка всегда временная и
всегда убирается одной командой.

Тронутые карточки помечаются, чтобы уборка не задела настоящие.
"""

import argparse
import asyncio
import sys

import asyncpg

for _p in (sys.stdout, sys.stderr):
    try:
        _p.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

BAZA = "postgresql://reestr:reestr@localhost:55432/reestr"
METKA = "тестовые данные"

NALIT = """
alter table kartochki add column if not exists testovaya boolean not null default false;

with nabor as (
  select k.id, row_number() over (order by k.id) as n
  from kartochki k
  where k.status = 'draft' and k.nik <> '' and not k.testovaya
  limit 60
)
update kartochki k set
  podpischiki = 5000 + (n * 2731) % 240000,
  ohvat       = 1200 + (n * 907)  % 60000,
  istochnik   = case when n % 3 = 0 then 'screen' else 'words' end,
  gorod_id    = (select id from goroda order by id limit 1 offset (n % 18)),
  yazyk       = (array['Казахский','Русский','Оба'])[1 + (n % 3)],
  stavka      = case when n % 5 = 0 then null else 15000 + (n * 3137) % 200000 end,
  dogovornaya = (n % 5 = 0),
  status      = 'published',
  opublikovana_v = now() - (n || ' hours')::interval,
  testovaya   = true
from nabor where k.id = nabor.id;

update kartochki k set rayon_id = (
  select r.id from rayony r where r.gorod_id = k.gorod_id order by r.id limit 1 offset (k.id % 2))
where k.testovaya and k.rayon_id is null
  and exists (select 1 from rayony r where r.gorod_id = k.gorod_id);

insert into kartochka_tematiki (kartochka_id, tematika_id)
select k.id, t.id from kartochki k
cross join lateral (
  select id from tematiki order by ((k.id * 7919 + id * 104729) % 1000) limit 1 + (k.id % 3)
) t
where k.testovaya on conflict do nothing;
"""

UBRAT = """
alter table kartochki add column if not exists testovaya boolean not null default false;

delete from kartochka_tematiki where kartochka_id in (select id from kartochki where testovaya);

update kartochki set
  podpischiki = null, ohvat = null, istochnik = 'words',
  gorod_id = null, rayon_id = null, yazyk = null,
  stavka = null, dogovornaya = false,
  status = 'draft', opublikovana_v = null, podana_v = null,
  prosmotry = 0, testovaya = false
where testovaya;
"""


async def main() -> None:
    razbor = argparse.ArgumentParser()
    razbor.add_argument("--nalit", action="store_true")
    razbor.add_argument("--ubrat", action="store_true")
    d = razbor.parse_args()
    if d.nalit == d.ubrat:
        raise SystemExit("Выбери одно: --nalit или --ubrat")

    conn = await asyncpg.connect(BAZA)
    try:
        await conn.execute(NALIT if d.nalit else UBRAT)
        opubl = await conn.fetchval("select count(*) from kartochki where status = 'published'")
        test = await conn.fetchval("select count(*) from kartochki where testovaya")
        print(f"{'налито' if d.nalit else 'убрано'}: {METKA}")
        print(f"  в каталоге сейчас: {opubl}")
        print(f"  помечено тестовыми: {test}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
