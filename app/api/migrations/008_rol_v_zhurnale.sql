-- Назначение и снятие модератора — тоже поступок админа, и он должен быть
-- виден в журнале. Слово владельца 07.09.2026: «добавь в админку
-- возможность назначать модератора».
--
-- Журнал раньше знал только про карточки, и его проверка не пускала иные
-- отметки. Расширяем список, старые записи не трогаем.

alter table zhurnal_moderatsii drop constraint zhurnal_moderatsii_chto_check;
alter table zhurnal_moderatsii add constraint zhurnal_moderatsii_chto_check
  check (chto in ('odobril', 'otklonil', 'popravil', 'udalil', 'zavel',
                  'naznachil-moderatora', 'snyal-moderatora'));
