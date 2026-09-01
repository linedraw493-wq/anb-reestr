-- Слово владельца 02.09.2026: каталог, фильтрация, карта, добить сущности.
--
-- Здесь то, чего не хватало в базе: согласие на обработку данных (требование
-- закона, а не наша выдумка), готовые причины отказа, счётчик просмотров
-- карточки и указатели под фильтры каталога.

-- ---------------------------------------------- согласие на обработку данных
-- Галочка на входе стоит с самого начала, но нигде не записывалась. Мы
-- собираем телефоны 306 живых людей — согласие надо уметь предъявить.

create table soglasiya (
  id           bigserial primary key,
  chelovek_id  bigint not null references lyudi(id) on delete cascade,
  versiya      text not null,               -- какая редакция текста была показана
  dano_v       timestamptz not null default now()
);

create index soglasiya_chelovek_idx on soglasiya (chelovek_id, dano_v desc);

comment on table soglasiya is
  'Кто и когда согласился на обработку телефона. Текст политики пишет юрист заказчика.';

-- ------------------------------------------------------- готовые причины отказа
-- Чтобы модератор не набирал одно и то же руками, а блогер получал понятную
-- формулировку. Своя причина текстом всё равно остаётся.

create table prichiny_otkaza (
  id        bigserial primary key,
  tekst     text not null unique,
  vidna     boolean not null default true,
  poryadok  integer not null default 0
);

insert into prichiny_otkaza (tekst, poryadok) values
  ('Цифры не сходятся со скрином статистики', 10),
  ('Скрин нечитаемый — загрузите чёткий', 20),
  ('Ссылка ведёт не на ваш профиль', 30),
  ('Тематика не соответствует содержанию профиля', 40),
  ('Профиль закрыт — рекламодатель не сможет его посмотреть', 50),
  ('Ставка выглядит ошибочной', 60)
on conflict (tekst) do nothing;

-- ------------------------------------------------------------ просмотры карточки
-- Блогеру видно, что реестр работает; заказчику — какие карточки живые.

alter table kartochki add column if not exists prosmotry integer not null default 0;

comment on column kartochki.prosmotry is
  'Сколько раз карточку открывали в каталоге. Считаем открытия страницы, не показы в списке.';

-- ------------------------------------------------------ право удалить свои данные
-- Требование закона: человек может уйти и забрать данные. Помечаем, чтобы
-- удаление было решением, а не случайным нажатием.

alter table lyudi add column if not exists udalen_v timestamptz;

comment on column lyudi.udalen_v is
  'Человек попросил удалить себя. Карточка сразу уходит из каталога, данные чистятся.';

-- ---------------------------------------------------------- указатели под фильтры
-- Каталог фильтрует по охвату, ставке и языку — без указателей на трёхстах
-- строках терпимо, но на росте станет заметно.

create index if not exists kartochki_ohvat_idx  on kartochki (ohvat desc) where status = 'published';
create index if not exists kartochki_stavka_idx on kartochki (stavka)     where status = 'published';
create index if not exists kartochki_yazyk_idx  on kartochki (yazyk)      where status = 'published';
create index if not exists ssylki_kartochka_idx on ssylki (kartochka_id);
