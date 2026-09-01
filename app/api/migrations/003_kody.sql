-- Коды входа. На Vercel их негде было хранить, и счётчик попыток считал
-- браузер — это было честно слабее. С базой считаем по-настоящему.
--
-- Сам код не хранится: только его отпечаток с тайной солью. Утечёт база —
-- коды из неё не достанут.

create table kody (
  id             bigserial primary key,
  chelovek_id    bigint not null references lyudi(id) on delete cascade,
  otpechatok     text not null,
  popytok        integer not null default 0,
  godin_do       timestamptz not null,
  ispolzovan_v   timestamptz,
  sozdan_v       timestamptz not null default now()
);

create index kody_chelovek_idx on kody (chelovek_id, sozdan_v desc);
