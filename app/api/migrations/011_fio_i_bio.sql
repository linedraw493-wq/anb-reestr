-- Имя и рассказ о себе в карточке — слово владельца 07.09.2026:
-- «описание БИО (ФИО) добавь».
--
-- Ник у блогера был с самого начала, а имени не было вовсе: рекламодатель
-- видел «@kotik_almaty» и не знал, к кому обращаться. Описание — короткий
-- рассказ о себе, его пишет сам блогер.
--
-- Оба поля необязательные: карточка без них живёт как раньше.

alter table kartochki add column if not exists fio text;
alter table kartochki add column if not exists bio text;

comment on column kartochki.fio is 'Имя и фамилия блогера. Пусто — показываем один ник.';
comment on column kartochki.bio is 'Короткий рассказ о себе, до 400 знаков.';
