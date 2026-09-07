-- Админа теперь назначают из самой админки, а не только настройками —
-- слово владельца 07.09.2026. Такой поступок тоже должен быть виден в
-- журнале, поэтому в список отметок добавляются ещё две.

alter table zhurnal_moderatsii drop constraint zhurnal_moderatsii_chto_check;
alter table zhurnal_moderatsii add constraint zhurnal_moderatsii_chto_check
  check (chto in ('odobril', 'otklonil', 'popravil', 'udalil', 'zavel',
                  'naznachil-moderatora', 'snyal-moderatora',
                  'naznachil-admina', 'snyal-admina'));
