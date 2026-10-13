-- ============================================================
-- 043 · FRAMES BY NAME (10/11, his call 15, yes to fixing the root: a tag keyed by the photo, and a takedown with an undo)
-- ============================================================
-- "I'm in this one" (037) stored a tag by POSITION (frame_tags.frame, 0 = the first frame). Taking one photo off a night
-- moved every later tag onto the wrong photo, and takedown.py had to print SQL that shifted everybody down one. A tag is
-- now keyed by the photo's file name, the stem of its thumbnail (media/017_t.jpg -> '017'), so a takedown moves nothing.
--   S1. frame_tags gets `media`, filled from the position map below; the key becomes (user_id, event_slug, media) and
--       frame stays as the position when tagged, for information only. The map (frame_positions) is KEPT, private: night
--       pages cached before the push still send a position, and the old frame_tag door turns it into a name through it.
--   S2. frame_takedowns, the desk's log of photos taken down: the tags that came off (so an undo puts them back) and
--       whether the laptop step (takedown.py) has removed the file yet.
--   S3. Member doors: frame_tag_by_name (the new one), frame_tag (the old one, still answering), my_frames, frames_of
--       and frame_tags_of now carry the name. frames_down lists what came down, no names (still-up photos for the desk only).
--   S4. Desk doors: every tag on a night (hidden members too), one person's tags, take a photo down, undo, the list.
--   S5. The verify row.
-- ⛔ The FRAME MAP block is written by framekeys.py from events/*/data.json. Run `python3 framekeys.py --check` right
--    before pasting: it says whether the block still matches the nights on disk. A tag on a night the map does not know
--    stops the whole paste and nothing goes in.
-- ⛔ A "potentially destructive query" prompt WILL appear (three functions dropped and re-made because their columns
--    changed, and the primary key of frame_tags swapped). Confirm it with "Run query".
-- A tag on a frame past a night's end (a photo that does not exist) is deleted, and a notice says how many. Nothing else
-- is deleted.
-- Safe to run twice. The last statement prints one row; every column should say true.
-- ============================================================


-- SECTION 1. Tags keyed by photo name ------------------------------------------------
alter table public.frame_tags add column if not exists media text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.frame_tags'::regclass and conname = 'frame_tags_media_shape') then
    alter table public.frame_tags add constraint frame_tags_media_shape
      check (media is null or media ~ '^[a-z0-9][a-z0-9_-]{0,40}$');
  end if;
end $$;

-- the position map: which photo sits at which lightbox position on each night, as built
create table if not exists public.frame_positions (
  event_slug text not null check (event_slug ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$'),
  frame      integer not null check (frame between 0 and 999),
  media      text not null check (media ~ '^[a-z0-9][a-z0-9_-]{0,40}$'),
  primary key (event_slug, frame),
  unique (event_slug, media)
);
alter table public.frame_positions enable row level security;
revoke all on table public.frame_positions from public, anon, authenticated;
comment on table public.frame_positions is
  'Lightbox positions as built, from events/*/data.json (043). Read only by the old frame_tag door and the backfill. A takedown clears that night. framekeys.py regenerates it.';

-- >>> FRAME MAP (framekeys.py writes this, do not hand-edit)
delete from public.frame_positions where event_slug in ('2026-08-14-blade-rave', '2026-08-16-the-mix', '2026-08-21-zen-haus', '2026-08-23-the-showcase', '2026-08-25-the-mix', '2026-08-30-clown-church', '2026-09-01-billy-release-party', '2026-09-11-brainrot', '2026-09-12-lucha-night', '2026-09-12-migx', '2026-09-13-burlesque-night', '2026-09-16-sadboyz-club', '2026-09-17-bar-hop', '2026-09-18-baptism', '2026-09-18-zen-haus', '2026-09-20-chill-and-smoke', '2026-09-24-harambe-4-ever', '2026-09-25-wap', '2026-10-03-pulse-angels-3');
insert into public.frame_positions (event_slug, frame, media) values
  ('2026-08-14-blade-rave',0,'001'),('2026-08-14-blade-rave',1,'002'),('2026-08-14-blade-rave',2,'003'),('2026-08-14-blade-rave',3,'004'),('2026-08-14-blade-rave',4,'005'),('2026-08-14-blade-rave',5,'006'),('2026-08-14-blade-rave',6,'007'),('2026-08-14-blade-rave',7,'008'),
  ('2026-08-14-blade-rave',8,'009'),('2026-08-14-blade-rave',9,'010'),('2026-08-14-blade-rave',10,'011'),('2026-08-14-blade-rave',11,'012'),('2026-08-14-blade-rave',12,'013'),('2026-08-14-blade-rave',13,'014'),('2026-08-14-blade-rave',14,'015'),('2026-08-14-blade-rave',15,'016'),
  ('2026-08-14-blade-rave',16,'017'),('2026-08-14-blade-rave',17,'018'),('2026-08-14-blade-rave',18,'019'),('2026-08-14-blade-rave',19,'020'),('2026-08-14-blade-rave',20,'021'),('2026-08-14-blade-rave',21,'022'),('2026-08-14-blade-rave',22,'023'),('2026-08-14-blade-rave',23,'024'),
  ('2026-08-14-blade-rave',24,'025'),('2026-08-14-blade-rave',25,'026'),('2026-08-14-blade-rave',26,'027'),('2026-08-14-blade-rave',27,'028'),('2026-08-14-blade-rave',28,'029'),('2026-08-14-blade-rave',29,'030'),('2026-08-14-blade-rave',30,'031'),('2026-08-14-blade-rave',31,'032'),
  ('2026-08-14-blade-rave',32,'033'),('2026-08-14-blade-rave',33,'034'),('2026-08-14-blade-rave',34,'035'),('2026-08-14-blade-rave',35,'036'),('2026-08-14-blade-rave',36,'037'),('2026-08-14-blade-rave',37,'038'),('2026-08-14-blade-rave',38,'039'),('2026-08-14-blade-rave',39,'040'),
  ('2026-08-14-blade-rave',40,'041'),('2026-08-14-blade-rave',41,'042'),('2026-08-14-blade-rave',42,'043'),('2026-08-14-blade-rave',43,'044'),('2026-08-14-blade-rave',44,'v01'),('2026-08-14-blade-rave',45,'v02'),('2026-08-14-blade-rave',46,'v03'),('2026-08-14-blade-rave',47,'v04'),
  ('2026-08-16-the-mix',0,'001'),('2026-08-16-the-mix',1,'002'),('2026-08-16-the-mix',2,'003'),('2026-08-16-the-mix',3,'004'),('2026-08-16-the-mix',4,'005'),('2026-08-16-the-mix',5,'006'),('2026-08-16-the-mix',6,'007'),('2026-08-16-the-mix',7,'008'),
  ('2026-08-16-the-mix',8,'009'),('2026-08-16-the-mix',9,'010'),('2026-08-16-the-mix',10,'011'),('2026-08-16-the-mix',11,'012'),('2026-08-16-the-mix',12,'013'),('2026-08-16-the-mix',13,'014'),('2026-08-16-the-mix',14,'015'),('2026-08-16-the-mix',15,'016'),
  ('2026-08-16-the-mix',16,'017'),('2026-08-16-the-mix',17,'018'),('2026-08-16-the-mix',18,'019'),('2026-08-16-the-mix',19,'020'),('2026-08-16-the-mix',20,'021'),('2026-08-16-the-mix',21,'022'),('2026-08-16-the-mix',22,'023'),('2026-08-16-the-mix',23,'024'),
  ('2026-08-16-the-mix',24,'025'),('2026-08-16-the-mix',25,'026'),('2026-08-16-the-mix',26,'027'),('2026-08-16-the-mix',27,'028'),('2026-08-16-the-mix',28,'029'),('2026-08-16-the-mix',29,'030'),('2026-08-16-the-mix',30,'031'),('2026-08-16-the-mix',31,'032'),
  ('2026-08-16-the-mix',32,'033'),('2026-08-16-the-mix',33,'034'),('2026-08-16-the-mix',34,'035'),('2026-08-16-the-mix',35,'036'),('2026-08-16-the-mix',36,'037'),('2026-08-16-the-mix',37,'038'),('2026-08-16-the-mix',38,'039'),('2026-08-16-the-mix',39,'040'),
  ('2026-08-16-the-mix',40,'041'),('2026-08-16-the-mix',41,'042'),('2026-08-16-the-mix',42,'043'),('2026-08-16-the-mix',43,'044'),('2026-08-16-the-mix',44,'v01'),('2026-08-16-the-mix',45,'v02'),('2026-08-16-the-mix',46,'v03'),
  ('2026-08-21-zen-haus',0,'001'),('2026-08-21-zen-haus',1,'002'),('2026-08-21-zen-haus',2,'003'),('2026-08-21-zen-haus',3,'004'),('2026-08-21-zen-haus',4,'005'),('2026-08-21-zen-haus',5,'006'),('2026-08-21-zen-haus',6,'007'),('2026-08-21-zen-haus',7,'008'),
  ('2026-08-21-zen-haus',8,'009'),('2026-08-21-zen-haus',9,'010'),('2026-08-21-zen-haus',10,'011'),('2026-08-21-zen-haus',11,'012'),('2026-08-21-zen-haus',12,'013'),('2026-08-21-zen-haus',13,'014'),('2026-08-21-zen-haus',14,'015'),('2026-08-21-zen-haus',15,'016'),
  ('2026-08-21-zen-haus',16,'017'),('2026-08-21-zen-haus',17,'018'),('2026-08-21-zen-haus',18,'019'),('2026-08-21-zen-haus',19,'020'),('2026-08-21-zen-haus',20,'021'),('2026-08-21-zen-haus',21,'022'),('2026-08-21-zen-haus',22,'023'),('2026-08-21-zen-haus',23,'024'),
  ('2026-08-21-zen-haus',24,'025'),('2026-08-21-zen-haus',25,'026'),('2026-08-21-zen-haus',26,'027'),('2026-08-21-zen-haus',27,'028'),('2026-08-21-zen-haus',28,'029'),('2026-08-21-zen-haus',29,'030'),('2026-08-21-zen-haus',30,'031'),('2026-08-21-zen-haus',31,'032'),
  ('2026-08-21-zen-haus',32,'033'),('2026-08-21-zen-haus',33,'034'),('2026-08-21-zen-haus',34,'035'),('2026-08-21-zen-haus',35,'036'),('2026-08-21-zen-haus',36,'037'),('2026-08-21-zen-haus',37,'038'),('2026-08-21-zen-haus',38,'039'),('2026-08-21-zen-haus',39,'040'),
  ('2026-08-23-the-showcase',0,'001'),('2026-08-23-the-showcase',1,'002'),('2026-08-23-the-showcase',2,'003'),('2026-08-23-the-showcase',3,'004'),('2026-08-23-the-showcase',4,'005'),('2026-08-23-the-showcase',5,'006'),('2026-08-23-the-showcase',6,'007'),('2026-08-23-the-showcase',7,'008'),
  ('2026-08-23-the-showcase',8,'009'),('2026-08-23-the-showcase',9,'010'),('2026-08-23-the-showcase',10,'011'),('2026-08-23-the-showcase',11,'012'),('2026-08-23-the-showcase',12,'013'),('2026-08-23-the-showcase',13,'014'),('2026-08-23-the-showcase',14,'015'),('2026-08-23-the-showcase',15,'016'),
  ('2026-08-23-the-showcase',16,'017'),('2026-08-23-the-showcase',17,'018'),('2026-08-23-the-showcase',18,'019'),('2026-08-23-the-showcase',19,'020'),('2026-08-23-the-showcase',20,'021'),('2026-08-23-the-showcase',21,'022'),('2026-08-23-the-showcase',22,'023'),('2026-08-23-the-showcase',23,'024'),
  ('2026-08-23-the-showcase',24,'025'),('2026-08-23-the-showcase',25,'026'),('2026-08-23-the-showcase',26,'027'),('2026-08-23-the-showcase',27,'028'),('2026-08-23-the-showcase',28,'029'),('2026-08-23-the-showcase',29,'030'),('2026-08-23-the-showcase',30,'031'),('2026-08-23-the-showcase',31,'032'),
  ('2026-08-23-the-showcase',32,'033'),('2026-08-23-the-showcase',33,'034'),('2026-08-23-the-showcase',34,'035'),('2026-08-23-the-showcase',35,'036'),('2026-08-23-the-showcase',36,'037'),('2026-08-23-the-showcase',37,'038'),('2026-08-23-the-showcase',38,'039'),('2026-08-23-the-showcase',39,'040'),
  ('2026-08-23-the-showcase',40,'041'),('2026-08-23-the-showcase',41,'042'),('2026-08-23-the-showcase',42,'043'),('2026-08-23-the-showcase',43,'044'),('2026-08-23-the-showcase',44,'045'),('2026-08-23-the-showcase',45,'046'),('2026-08-23-the-showcase',46,'047'),('2026-08-23-the-showcase',47,'048'),
  ('2026-08-23-the-showcase',48,'049'),('2026-08-23-the-showcase',49,'050'),('2026-08-23-the-showcase',50,'051'),('2026-08-23-the-showcase',51,'052'),('2026-08-23-the-showcase',52,'053'),('2026-08-23-the-showcase',53,'054'),('2026-08-23-the-showcase',54,'055'),('2026-08-23-the-showcase',55,'056'),
  ('2026-08-23-the-showcase',56,'057'),('2026-08-23-the-showcase',57,'058'),('2026-08-23-the-showcase',58,'059'),('2026-08-23-the-showcase',59,'060'),
  ('2026-08-25-the-mix',0,'001'),('2026-08-25-the-mix',1,'002'),('2026-08-25-the-mix',2,'003'),('2026-08-25-the-mix',3,'004'),('2026-08-25-the-mix',4,'005'),('2026-08-25-the-mix',5,'006'),('2026-08-25-the-mix',6,'007'),('2026-08-25-the-mix',7,'008'),
  ('2026-08-25-the-mix',8,'009'),('2026-08-25-the-mix',9,'010'),('2026-08-25-the-mix',10,'011'),('2026-08-25-the-mix',11,'012'),('2026-08-25-the-mix',12,'013'),('2026-08-25-the-mix',13,'014'),('2026-08-25-the-mix',14,'015'),('2026-08-25-the-mix',15,'016'),
  ('2026-08-25-the-mix',16,'017'),('2026-08-25-the-mix',17,'018'),('2026-08-25-the-mix',18,'019'),('2026-08-25-the-mix',19,'020'),('2026-08-25-the-mix',20,'023'),('2026-08-25-the-mix',21,'024'),('2026-08-25-the-mix',22,'025'),('2026-08-25-the-mix',23,'026'),
  ('2026-08-25-the-mix',24,'027'),('2026-08-25-the-mix',25,'028'),('2026-08-25-the-mix',26,'029'),('2026-08-25-the-mix',27,'032'),('2026-08-25-the-mix',28,'033'),('2026-08-25-the-mix',29,'034'),('2026-08-25-the-mix',30,'035'),('2026-08-25-the-mix',31,'036'),
  ('2026-08-25-the-mix',32,'037'),('2026-08-25-the-mix',33,'038'),('2026-08-25-the-mix',34,'039'),('2026-08-25-the-mix',35,'040'),('2026-08-25-the-mix',36,'041'),('2026-08-25-the-mix',37,'042'),
  ('2026-08-30-clown-church',0,'001'),('2026-08-30-clown-church',1,'002'),('2026-08-30-clown-church',2,'003'),('2026-08-30-clown-church',3,'004'),('2026-08-30-clown-church',4,'005'),('2026-08-30-clown-church',5,'006'),('2026-08-30-clown-church',6,'007'),('2026-08-30-clown-church',7,'008'),
  ('2026-08-30-clown-church',8,'009'),('2026-08-30-clown-church',9,'010'),('2026-08-30-clown-church',10,'011'),('2026-08-30-clown-church',11,'012'),('2026-08-30-clown-church',12,'013'),('2026-08-30-clown-church',13,'014'),('2026-08-30-clown-church',14,'015'),('2026-08-30-clown-church',15,'016'),
  ('2026-08-30-clown-church',16,'017'),('2026-08-30-clown-church',17,'018'),('2026-08-30-clown-church',18,'019'),('2026-08-30-clown-church',19,'020'),('2026-08-30-clown-church',20,'021'),('2026-08-30-clown-church',21,'022'),('2026-08-30-clown-church',22,'023'),('2026-08-30-clown-church',23,'024'),
  ('2026-08-30-clown-church',24,'025'),('2026-08-30-clown-church',25,'026'),('2026-08-30-clown-church',26,'027'),('2026-08-30-clown-church',27,'028'),('2026-08-30-clown-church',28,'029'),('2026-08-30-clown-church',29,'030'),('2026-08-30-clown-church',30,'031'),('2026-08-30-clown-church',31,'032'),
  ('2026-08-30-clown-church',32,'033'),('2026-08-30-clown-church',33,'034'),('2026-08-30-clown-church',34,'035'),('2026-08-30-clown-church',35,'036'),('2026-08-30-clown-church',36,'037'),('2026-08-30-clown-church',37,'038'),('2026-08-30-clown-church',38,'039'),('2026-08-30-clown-church',39,'040'),
  ('2026-08-30-clown-church',40,'v01'),('2026-08-30-clown-church',41,'v09'),('2026-08-30-clown-church',42,'v02'),('2026-08-30-clown-church',43,'v10'),('2026-08-30-clown-church',44,'v03'),('2026-08-30-clown-church',45,'v11'),('2026-08-30-clown-church',46,'v12'),('2026-08-30-clown-church',47,'v13'),
  ('2026-08-30-clown-church',48,'v14'),('2026-08-30-clown-church',49,'v15'),('2026-08-30-clown-church',50,'v04'),('2026-08-30-clown-church',51,'v05'),('2026-08-30-clown-church',52,'v06'),('2026-08-30-clown-church',53,'v16'),('2026-08-30-clown-church',54,'v17'),('2026-08-30-clown-church',55,'v07'),
  ('2026-08-30-clown-church',56,'v18'),('2026-08-30-clown-church',57,'v19'),('2026-08-30-clown-church',58,'v20'),('2026-08-30-clown-church',59,'v08'),
  ('2026-09-01-billy-release-party',0,'001'),('2026-09-01-billy-release-party',1,'002'),('2026-09-01-billy-release-party',2,'003'),('2026-09-01-billy-release-party',3,'004'),('2026-09-01-billy-release-party',4,'005'),('2026-09-01-billy-release-party',5,'006'),('2026-09-01-billy-release-party',6,'007'),('2026-09-01-billy-release-party',7,'008'),
  ('2026-09-01-billy-release-party',8,'009'),('2026-09-01-billy-release-party',9,'010'),('2026-09-01-billy-release-party',10,'011'),('2026-09-01-billy-release-party',11,'012'),('2026-09-01-billy-release-party',12,'013'),('2026-09-01-billy-release-party',13,'014'),('2026-09-01-billy-release-party',14,'015'),('2026-09-01-billy-release-party',15,'016'),
  ('2026-09-01-billy-release-party',16,'017'),('2026-09-01-billy-release-party',17,'018'),('2026-09-01-billy-release-party',18,'019'),('2026-09-01-billy-release-party',19,'020'),('2026-09-01-billy-release-party',20,'021'),('2026-09-01-billy-release-party',21,'022'),('2026-09-01-billy-release-party',22,'023'),('2026-09-01-billy-release-party',23,'024'),
  ('2026-09-01-billy-release-party',24,'025'),('2026-09-01-billy-release-party',25,'026'),('2026-09-01-billy-release-party',26,'027'),('2026-09-01-billy-release-party',27,'028'),('2026-09-01-billy-release-party',28,'029'),('2026-09-01-billy-release-party',29,'030'),('2026-09-01-billy-release-party',30,'031'),('2026-09-01-billy-release-party',31,'032'),
  ('2026-09-01-billy-release-party',32,'033'),('2026-09-01-billy-release-party',33,'034'),('2026-09-01-billy-release-party',34,'035'),('2026-09-01-billy-release-party',35,'036'),('2026-09-01-billy-release-party',36,'037'),('2026-09-01-billy-release-party',37,'038'),('2026-09-01-billy-release-party',38,'039'),('2026-09-01-billy-release-party',39,'040'),
  ('2026-09-01-billy-release-party',40,'041'),('2026-09-01-billy-release-party',41,'042'),('2026-09-01-billy-release-party',42,'043'),('2026-09-01-billy-release-party',43,'044'),('2026-09-01-billy-release-party',44,'045'),('2026-09-01-billy-release-party',45,'046'),('2026-09-01-billy-release-party',46,'047'),('2026-09-01-billy-release-party',47,'048'),
  ('2026-09-01-billy-release-party',48,'049'),('2026-09-01-billy-release-party',49,'050'),('2026-09-01-billy-release-party',50,'051'),('2026-09-01-billy-release-party',51,'052'),('2026-09-01-billy-release-party',52,'053'),('2026-09-01-billy-release-party',53,'054'),('2026-09-01-billy-release-party',54,'055'),('2026-09-01-billy-release-party',55,'056'),
  ('2026-09-01-billy-release-party',56,'057'),('2026-09-01-billy-release-party',57,'058'),('2026-09-01-billy-release-party',58,'v01'),('2026-09-01-billy-release-party',59,'v02'),('2026-09-01-billy-release-party',60,'v03'),('2026-09-01-billy-release-party',61,'v04'),('2026-09-01-billy-release-party',62,'v05'),('2026-09-01-billy-release-party',63,'v06'),
  ('2026-09-11-brainrot',0,'001'),('2026-09-11-brainrot',1,'002'),('2026-09-11-brainrot',2,'003'),('2026-09-11-brainrot',3,'004'),('2026-09-11-brainrot',4,'005'),('2026-09-11-brainrot',5,'006'),('2026-09-11-brainrot',6,'007'),('2026-09-11-brainrot',7,'008'),
  ('2026-09-11-brainrot',8,'009'),('2026-09-11-brainrot',9,'010'),('2026-09-11-brainrot',10,'011'),('2026-09-11-brainrot',11,'012'),('2026-09-11-brainrot',12,'013'),('2026-09-11-brainrot',13,'014'),('2026-09-11-brainrot',14,'015'),('2026-09-11-brainrot',15,'016'),
  ('2026-09-11-brainrot',16,'017'),('2026-09-11-brainrot',17,'018'),('2026-09-11-brainrot',18,'019'),('2026-09-11-brainrot',19,'020'),('2026-09-11-brainrot',20,'021'),('2026-09-11-brainrot',21,'022'),('2026-09-11-brainrot',22,'023'),('2026-09-11-brainrot',23,'024'),
  ('2026-09-11-brainrot',24,'025'),('2026-09-11-brainrot',25,'026'),('2026-09-11-brainrot',26,'027'),('2026-09-11-brainrot',27,'028'),('2026-09-11-brainrot',28,'029'),('2026-09-11-brainrot',29,'030'),('2026-09-11-brainrot',30,'031'),('2026-09-11-brainrot',31,'032'),
  ('2026-09-11-brainrot',32,'033'),('2026-09-11-brainrot',33,'034'),('2026-09-11-brainrot',34,'035'),('2026-09-11-brainrot',35,'036'),('2026-09-11-brainrot',36,'037'),('2026-09-11-brainrot',37,'038'),('2026-09-11-brainrot',38,'039'),('2026-09-11-brainrot',39,'040'),
  ('2026-09-11-brainrot',40,'041'),('2026-09-11-brainrot',41,'042'),('2026-09-11-brainrot',42,'043'),('2026-09-11-brainrot',43,'044'),('2026-09-11-brainrot',44,'045'),('2026-09-11-brainrot',45,'046'),('2026-09-11-brainrot',46,'047'),('2026-09-11-brainrot',47,'048'),
  ('2026-09-11-brainrot',48,'049'),('2026-09-11-brainrot',49,'050'),('2026-09-11-brainrot',50,'051'),('2026-09-11-brainrot',51,'052'),('2026-09-11-brainrot',52,'053'),('2026-09-11-brainrot',53,'054'),('2026-09-11-brainrot',54,'055'),('2026-09-11-brainrot',55,'056'),
  ('2026-09-11-brainrot',56,'057'),('2026-09-11-brainrot',57,'058'),('2026-09-11-brainrot',58,'059'),('2026-09-11-brainrot',59,'060'),('2026-09-11-brainrot',60,'061'),('2026-09-11-brainrot',61,'062'),('2026-09-11-brainrot',62,'063'),('2026-09-11-brainrot',63,'064'),
  ('2026-09-11-brainrot',64,'065'),('2026-09-11-brainrot',65,'066'),('2026-09-11-brainrot',66,'067'),('2026-09-11-brainrot',67,'068'),('2026-09-11-brainrot',68,'069'),('2026-09-11-brainrot',69,'070'),('2026-09-11-brainrot',70,'071'),('2026-09-11-brainrot',71,'072'),
  ('2026-09-11-brainrot',72,'073'),('2026-09-11-brainrot',73,'074'),('2026-09-11-brainrot',74,'075'),('2026-09-11-brainrot',75,'076'),('2026-09-11-brainrot',76,'077'),('2026-09-11-brainrot',77,'078'),('2026-09-11-brainrot',78,'079'),('2026-09-11-brainrot',79,'080'),
  ('2026-09-11-brainrot',80,'081'),('2026-09-11-brainrot',81,'082'),('2026-09-11-brainrot',82,'083'),('2026-09-11-brainrot',83,'084'),('2026-09-11-brainrot',84,'085'),('2026-09-11-brainrot',85,'086'),('2026-09-11-brainrot',86,'087'),('2026-09-11-brainrot',87,'088'),
  ('2026-09-11-brainrot',88,'089'),('2026-09-11-brainrot',89,'090'),('2026-09-11-brainrot',90,'091'),('2026-09-11-brainrot',91,'092'),('2026-09-11-brainrot',92,'093'),('2026-09-11-brainrot',93,'094'),('2026-09-11-brainrot',94,'095'),('2026-09-11-brainrot',95,'096'),
  ('2026-09-11-brainrot',96,'097'),('2026-09-11-brainrot',97,'098'),('2026-09-11-brainrot',98,'099'),('2026-09-11-brainrot',99,'100'),('2026-09-11-brainrot',100,'101'),('2026-09-11-brainrot',101,'102'),('2026-09-11-brainrot',102,'103'),('2026-09-11-brainrot',103,'104'),
  ('2026-09-11-brainrot',104,'105'),('2026-09-11-brainrot',105,'106'),('2026-09-11-brainrot',106,'107'),('2026-09-11-brainrot',107,'108'),('2026-09-11-brainrot',108,'109'),('2026-09-11-brainrot',109,'110'),('2026-09-11-brainrot',110,'111'),('2026-09-11-brainrot',111,'112'),
  ('2026-09-11-brainrot',112,'113'),('2026-09-11-brainrot',113,'114'),('2026-09-11-brainrot',114,'115'),('2026-09-11-brainrot',115,'116'),('2026-09-11-brainrot',116,'117'),('2026-09-11-brainrot',117,'118'),('2026-09-11-brainrot',118,'119'),('2026-09-11-brainrot',119,'120'),
  ('2026-09-12-lucha-night',0,'001'),('2026-09-12-lucha-night',1,'002'),('2026-09-12-lucha-night',2,'003'),('2026-09-12-lucha-night',3,'004'),('2026-09-12-lucha-night',4,'005'),('2026-09-12-lucha-night',5,'006'),('2026-09-12-lucha-night',6,'007'),('2026-09-12-lucha-night',7,'008'),
  ('2026-09-12-lucha-night',8,'009'),('2026-09-12-lucha-night',9,'010'),('2026-09-12-lucha-night',10,'011'),('2026-09-12-lucha-night',11,'012'),('2026-09-12-lucha-night',12,'013'),('2026-09-12-lucha-night',13,'014'),('2026-09-12-lucha-night',14,'015'),('2026-09-12-lucha-night',15,'016'),
  ('2026-09-12-lucha-night',16,'017'),('2026-09-12-lucha-night',17,'018'),('2026-09-12-lucha-night',18,'019'),('2026-09-12-lucha-night',19,'020'),('2026-09-12-lucha-night',20,'021'),('2026-09-12-lucha-night',21,'022'),('2026-09-12-lucha-night',22,'023'),('2026-09-12-lucha-night',23,'024'),
  ('2026-09-12-lucha-night',24,'025'),('2026-09-12-lucha-night',25,'v01'),('2026-09-12-lucha-night',26,'v02'),('2026-09-12-lucha-night',27,'v03'),('2026-09-12-lucha-night',28,'v04'),
  ('2026-09-12-migx',0,'001'),('2026-09-12-migx',1,'002'),('2026-09-12-migx',2,'003'),('2026-09-12-migx',3,'004'),('2026-09-12-migx',4,'005'),('2026-09-12-migx',5,'006'),('2026-09-12-migx',6,'007'),('2026-09-12-migx',7,'008'),
  ('2026-09-12-migx',8,'009'),('2026-09-12-migx',9,'010'),('2026-09-12-migx',10,'011'),('2026-09-12-migx',11,'012'),('2026-09-12-migx',12,'013'),('2026-09-12-migx',13,'014'),('2026-09-12-migx',14,'015'),('2026-09-12-migx',15,'016'),
  ('2026-09-12-migx',16,'017'),('2026-09-12-migx',17,'018'),('2026-09-12-migx',18,'019'),('2026-09-12-migx',19,'020'),('2026-09-12-migx',20,'021'),('2026-09-12-migx',21,'022'),('2026-09-12-migx',22,'023'),('2026-09-12-migx',23,'024'),
  ('2026-09-12-migx',24,'025'),('2026-09-12-migx',25,'026'),('2026-09-12-migx',26,'027'),('2026-09-12-migx',27,'028'),('2026-09-12-migx',28,'029'),('2026-09-12-migx',29,'030'),('2026-09-12-migx',30,'031'),('2026-09-12-migx',31,'032'),
  ('2026-09-12-migx',32,'033'),('2026-09-12-migx',33,'034'),('2026-09-12-migx',34,'035'),('2026-09-12-migx',35,'036'),('2026-09-12-migx',36,'037'),('2026-09-12-migx',37,'v01'),('2026-09-12-migx',38,'v02'),('2026-09-12-migx',39,'v03'),
  ('2026-09-12-migx',40,'v04'),('2026-09-12-migx',41,'v05'),
  ('2026-09-13-burlesque-night',0,'001'),('2026-09-13-burlesque-night',1,'002'),('2026-09-13-burlesque-night',2,'003'),('2026-09-13-burlesque-night',3,'004'),('2026-09-13-burlesque-night',4,'005'),('2026-09-13-burlesque-night',5,'006'),('2026-09-13-burlesque-night',6,'007'),('2026-09-13-burlesque-night',7,'008'),
  ('2026-09-13-burlesque-night',8,'009'),('2026-09-13-burlesque-night',9,'010'),('2026-09-13-burlesque-night',10,'011'),('2026-09-13-burlesque-night',11,'012'),('2026-09-13-burlesque-night',12,'013'),('2026-09-13-burlesque-night',13,'014'),('2026-09-13-burlesque-night',14,'015'),('2026-09-13-burlesque-night',15,'016'),
  ('2026-09-13-burlesque-night',16,'017'),('2026-09-13-burlesque-night',17,'018'),('2026-09-13-burlesque-night',18,'019'),('2026-09-13-burlesque-night',19,'020'),('2026-09-13-burlesque-night',20,'021'),('2026-09-13-burlesque-night',21,'022'),('2026-09-13-burlesque-night',22,'023'),('2026-09-13-burlesque-night',23,'024'),
  ('2026-09-13-burlesque-night',24,'025'),('2026-09-13-burlesque-night',25,'026'),('2026-09-13-burlesque-night',26,'027'),('2026-09-13-burlesque-night',27,'028'),('2026-09-13-burlesque-night',28,'029'),('2026-09-13-burlesque-night',29,'030'),('2026-09-13-burlesque-night',30,'031'),('2026-09-13-burlesque-night',31,'032'),
  ('2026-09-13-burlesque-night',32,'033'),('2026-09-13-burlesque-night',33,'034'),('2026-09-13-burlesque-night',34,'035'),('2026-09-13-burlesque-night',35,'036'),('2026-09-13-burlesque-night',36,'037'),('2026-09-13-burlesque-night',37,'038'),('2026-09-13-burlesque-night',38,'039'),('2026-09-13-burlesque-night',39,'040'),
  ('2026-09-13-burlesque-night',40,'041'),('2026-09-13-burlesque-night',41,'042'),('2026-09-13-burlesque-night',42,'043'),('2026-09-13-burlesque-night',43,'044'),('2026-09-13-burlesque-night',44,'v01'),('2026-09-13-burlesque-night',45,'v02'),('2026-09-13-burlesque-night',46,'v03'),('2026-09-13-burlesque-night',47,'v04'),
  ('2026-09-13-burlesque-night',48,'v05'),('2026-09-13-burlesque-night',49,'v06'),
  ('2026-09-16-sadboyz-club',0,'001'),('2026-09-16-sadboyz-club',1,'002'),('2026-09-16-sadboyz-club',2,'003'),('2026-09-16-sadboyz-club',3,'004'),('2026-09-16-sadboyz-club',4,'005'),('2026-09-16-sadboyz-club',5,'006'),('2026-09-16-sadboyz-club',6,'007'),('2026-09-16-sadboyz-club',7,'008'),
  ('2026-09-16-sadboyz-club',8,'009'),('2026-09-16-sadboyz-club',9,'010'),('2026-09-16-sadboyz-club',10,'011'),('2026-09-16-sadboyz-club',11,'012'),('2026-09-16-sadboyz-club',12,'013'),('2026-09-16-sadboyz-club',13,'014'),('2026-09-16-sadboyz-club',14,'015'),('2026-09-16-sadboyz-club',15,'016'),
  ('2026-09-16-sadboyz-club',16,'017'),('2026-09-16-sadboyz-club',17,'018'),('2026-09-16-sadboyz-club',18,'019'),('2026-09-16-sadboyz-club',19,'020'),('2026-09-16-sadboyz-club',20,'021'),('2026-09-16-sadboyz-club',21,'022'),('2026-09-16-sadboyz-club',22,'023'),('2026-09-16-sadboyz-club',23,'024'),
  ('2026-09-16-sadboyz-club',24,'025'),('2026-09-16-sadboyz-club',25,'026'),('2026-09-16-sadboyz-club',26,'027'),('2026-09-16-sadboyz-club',27,'028'),('2026-09-16-sadboyz-club',28,'029'),('2026-09-16-sadboyz-club',29,'030'),('2026-09-16-sadboyz-club',30,'031'),('2026-09-16-sadboyz-club',31,'032'),
  ('2026-09-16-sadboyz-club',32,'033'),('2026-09-16-sadboyz-club',33,'034'),('2026-09-16-sadboyz-club',34,'035'),('2026-09-16-sadboyz-club',35,'036'),('2026-09-16-sadboyz-club',36,'037'),('2026-09-16-sadboyz-club',37,'038'),('2026-09-16-sadboyz-club',38,'039'),('2026-09-16-sadboyz-club',39,'040'),
  ('2026-09-16-sadboyz-club',40,'041'),('2026-09-16-sadboyz-club',41,'042'),('2026-09-16-sadboyz-club',42,'043'),('2026-09-16-sadboyz-club',43,'044'),('2026-09-16-sadboyz-club',44,'045'),('2026-09-16-sadboyz-club',45,'046'),('2026-09-16-sadboyz-club',46,'047'),('2026-09-16-sadboyz-club',47,'048'),
  ('2026-09-16-sadboyz-club',48,'049'),('2026-09-16-sadboyz-club',49,'050'),('2026-09-16-sadboyz-club',50,'051'),('2026-09-16-sadboyz-club',51,'052'),('2026-09-16-sadboyz-club',52,'053'),('2026-09-16-sadboyz-club',53,'054'),('2026-09-16-sadboyz-club',54,'055'),('2026-09-16-sadboyz-club',55,'056'),
  ('2026-09-16-sadboyz-club',56,'057'),('2026-09-16-sadboyz-club',57,'058'),('2026-09-16-sadboyz-club',58,'059'),
  ('2026-09-17-bar-hop',0,'001'),('2026-09-17-bar-hop',1,'002'),('2026-09-17-bar-hop',2,'003'),('2026-09-17-bar-hop',3,'004'),('2026-09-17-bar-hop',4,'005'),('2026-09-17-bar-hop',5,'006'),('2026-09-17-bar-hop',6,'007'),('2026-09-17-bar-hop',7,'008'),
  ('2026-09-17-bar-hop',8,'009'),('2026-09-17-bar-hop',9,'010'),('2026-09-17-bar-hop',10,'011'),('2026-09-17-bar-hop',11,'012'),('2026-09-17-bar-hop',12,'013'),('2026-09-17-bar-hop',13,'014'),('2026-09-17-bar-hop',14,'015'),('2026-09-17-bar-hop',15,'016'),
  ('2026-09-17-bar-hop',16,'017'),('2026-09-17-bar-hop',17,'018'),('2026-09-17-bar-hop',18,'019'),('2026-09-17-bar-hop',19,'020'),('2026-09-17-bar-hop',20,'021'),('2026-09-17-bar-hop',21,'022'),('2026-09-17-bar-hop',22,'023'),('2026-09-17-bar-hop',23,'024'),
  ('2026-09-17-bar-hop',24,'025'),('2026-09-17-bar-hop',25,'026'),('2026-09-17-bar-hop',26,'027'),('2026-09-17-bar-hop',27,'028'),('2026-09-17-bar-hop',28,'029'),('2026-09-17-bar-hop',29,'030'),('2026-09-17-bar-hop',30,'031'),('2026-09-17-bar-hop',31,'032'),
  ('2026-09-17-bar-hop',32,'033'),('2026-09-17-bar-hop',33,'034'),('2026-09-17-bar-hop',34,'035'),('2026-09-17-bar-hop',35,'036'),('2026-09-17-bar-hop',36,'037'),('2026-09-17-bar-hop',37,'038'),('2026-09-17-bar-hop',38,'039'),
  ('2026-09-18-baptism',0,'001'),('2026-09-18-baptism',1,'002'),('2026-09-18-baptism',2,'003'),('2026-09-18-baptism',3,'004'),('2026-09-18-baptism',4,'005'),('2026-09-18-baptism',5,'006'),('2026-09-18-baptism',6,'007'),('2026-09-18-baptism',7,'008'),
  ('2026-09-18-baptism',8,'009'),('2026-09-18-baptism',9,'010'),('2026-09-18-baptism',10,'011'),('2026-09-18-baptism',11,'012'),('2026-09-18-baptism',12,'013'),('2026-09-18-baptism',13,'014'),('2026-09-18-baptism',14,'015'),('2026-09-18-baptism',15,'016'),
  ('2026-09-18-baptism',16,'017'),('2026-09-18-baptism',17,'018'),('2026-09-18-baptism',18,'019'),('2026-09-18-baptism',19,'020'),('2026-09-18-baptism',20,'021'),('2026-09-18-baptism',21,'022'),('2026-09-18-baptism',22,'023'),('2026-09-18-baptism',23,'024'),
  ('2026-09-18-baptism',24,'025'),('2026-09-18-baptism',25,'026'),('2026-09-18-baptism',26,'027'),('2026-09-18-baptism',27,'028'),('2026-09-18-baptism',28,'029'),('2026-09-18-baptism',29,'030'),('2026-09-18-baptism',30,'031'),('2026-09-18-baptism',31,'032'),
  ('2026-09-18-baptism',32,'033'),('2026-09-18-baptism',33,'034'),('2026-09-18-baptism',34,'035'),('2026-09-18-baptism',35,'036'),('2026-09-18-baptism',36,'037'),('2026-09-18-baptism',37,'038'),('2026-09-18-baptism',38,'039'),('2026-09-18-baptism',39,'040'),
  ('2026-09-18-baptism',40,'041'),('2026-09-18-baptism',41,'042'),('2026-09-18-baptism',42,'043'),('2026-09-18-baptism',43,'044'),('2026-09-18-baptism',44,'045'),('2026-09-18-baptism',45,'046'),('2026-09-18-baptism',46,'047'),('2026-09-18-baptism',47,'048'),
  ('2026-09-18-baptism',48,'049'),('2026-09-18-baptism',49,'050'),('2026-09-18-baptism',50,'051'),('2026-09-18-baptism',51,'052'),('2026-09-18-baptism',52,'053'),('2026-09-18-baptism',53,'054'),('2026-09-18-baptism',54,'055'),('2026-09-18-baptism',55,'056'),
  ('2026-09-18-baptism',56,'057'),('2026-09-18-baptism',57,'058'),('2026-09-18-baptism',58,'059'),('2026-09-18-baptism',59,'060'),
  ('2026-09-18-zen-haus',0,'001'),('2026-09-18-zen-haus',1,'002'),('2026-09-18-zen-haus',2,'003'),('2026-09-18-zen-haus',3,'004'),('2026-09-18-zen-haus',4,'005'),('2026-09-18-zen-haus',5,'006'),('2026-09-18-zen-haus',6,'007'),('2026-09-18-zen-haus',7,'008'),
  ('2026-09-18-zen-haus',8,'009'),('2026-09-18-zen-haus',9,'010'),('2026-09-18-zen-haus',10,'011'),('2026-09-18-zen-haus',11,'012'),('2026-09-18-zen-haus',12,'013'),('2026-09-18-zen-haus',13,'014'),('2026-09-18-zen-haus',14,'015'),('2026-09-18-zen-haus',15,'016'),
  ('2026-09-18-zen-haus',16,'017'),('2026-09-18-zen-haus',17,'018'),('2026-09-18-zen-haus',18,'019'),('2026-09-18-zen-haus',19,'020'),('2026-09-18-zen-haus',20,'021'),('2026-09-18-zen-haus',21,'022'),('2026-09-18-zen-haus',22,'023'),('2026-09-18-zen-haus',23,'024'),
  ('2026-09-18-zen-haus',24,'025'),('2026-09-18-zen-haus',25,'026'),('2026-09-18-zen-haus',26,'027'),('2026-09-18-zen-haus',27,'028'),('2026-09-18-zen-haus',28,'029'),('2026-09-18-zen-haus',29,'030'),('2026-09-18-zen-haus',30,'031'),('2026-09-18-zen-haus',31,'032'),
  ('2026-09-18-zen-haus',32,'033'),('2026-09-18-zen-haus',33,'034'),('2026-09-18-zen-haus',34,'035'),('2026-09-18-zen-haus',35,'036'),('2026-09-18-zen-haus',36,'037'),('2026-09-18-zen-haus',37,'038'),('2026-09-18-zen-haus',38,'039'),('2026-09-18-zen-haus',39,'040'),
  ('2026-09-18-zen-haus',40,'041'),('2026-09-18-zen-haus',41,'042'),('2026-09-18-zen-haus',42,'043'),('2026-09-18-zen-haus',43,'044'),('2026-09-18-zen-haus',44,'045'),('2026-09-18-zen-haus',45,'046'),('2026-09-18-zen-haus',46,'047'),('2026-09-18-zen-haus',47,'048'),
  ('2026-09-18-zen-haus',48,'049'),('2026-09-18-zen-haus',49,'050'),
  ('2026-09-20-chill-and-smoke',0,'001'),('2026-09-20-chill-and-smoke',1,'002'),('2026-09-20-chill-and-smoke',2,'003'),('2026-09-20-chill-and-smoke',3,'004'),('2026-09-20-chill-and-smoke',4,'005'),('2026-09-20-chill-and-smoke',5,'006'),('2026-09-20-chill-and-smoke',6,'007'),('2026-09-20-chill-and-smoke',7,'008'),
  ('2026-09-20-chill-and-smoke',8,'009'),('2026-09-20-chill-and-smoke',9,'010'),('2026-09-20-chill-and-smoke',10,'011'),('2026-09-20-chill-and-smoke',11,'012'),('2026-09-20-chill-and-smoke',12,'013'),('2026-09-20-chill-and-smoke',13,'014'),('2026-09-20-chill-and-smoke',14,'015'),('2026-09-20-chill-and-smoke',15,'016'),
  ('2026-09-20-chill-and-smoke',16,'017'),('2026-09-20-chill-and-smoke',17,'018'),('2026-09-20-chill-and-smoke',18,'019'),
  ('2026-09-24-harambe-4-ever',0,'001'),('2026-09-24-harambe-4-ever',1,'002'),('2026-09-24-harambe-4-ever',2,'003'),('2026-09-24-harambe-4-ever',3,'004'),('2026-09-24-harambe-4-ever',4,'005'),('2026-09-24-harambe-4-ever',5,'006'),('2026-09-24-harambe-4-ever',6,'007'),('2026-09-24-harambe-4-ever',7,'008'),
  ('2026-09-24-harambe-4-ever',8,'009'),('2026-09-24-harambe-4-ever',9,'010'),('2026-09-24-harambe-4-ever',10,'011'),('2026-09-24-harambe-4-ever',11,'012'),('2026-09-24-harambe-4-ever',12,'013'),('2026-09-24-harambe-4-ever',13,'014'),('2026-09-24-harambe-4-ever',14,'015'),('2026-09-24-harambe-4-ever',15,'016'),
  ('2026-09-24-harambe-4-ever',16,'017'),('2026-09-24-harambe-4-ever',17,'018'),('2026-09-24-harambe-4-ever',18,'019'),('2026-09-24-harambe-4-ever',19,'020'),('2026-09-24-harambe-4-ever',20,'021'),('2026-09-24-harambe-4-ever',21,'022'),('2026-09-24-harambe-4-ever',22,'023'),('2026-09-24-harambe-4-ever',23,'024'),
  ('2026-09-24-harambe-4-ever',24,'025'),('2026-09-24-harambe-4-ever',25,'026'),('2026-09-24-harambe-4-ever',26,'027'),('2026-09-24-harambe-4-ever',27,'028'),('2026-09-24-harambe-4-ever',28,'029'),('2026-09-24-harambe-4-ever',29,'030'),('2026-09-24-harambe-4-ever',30,'031'),('2026-09-24-harambe-4-ever',31,'032'),
  ('2026-09-24-harambe-4-ever',32,'033'),('2026-09-24-harambe-4-ever',33,'034'),('2026-09-24-harambe-4-ever',34,'035'),('2026-09-24-harambe-4-ever',35,'036'),('2026-09-24-harambe-4-ever',36,'037'),('2026-09-24-harambe-4-ever',37,'038'),('2026-09-24-harambe-4-ever',38,'039'),('2026-09-24-harambe-4-ever',39,'040'),
  ('2026-09-24-harambe-4-ever',40,'041'),('2026-09-24-harambe-4-ever',41,'042'),('2026-09-24-harambe-4-ever',42,'043'),('2026-09-24-harambe-4-ever',43,'044'),('2026-09-24-harambe-4-ever',44,'045'),('2026-09-24-harambe-4-ever',45,'046'),('2026-09-24-harambe-4-ever',46,'047'),('2026-09-24-harambe-4-ever',47,'048'),
  ('2026-09-24-harambe-4-ever',48,'049'),('2026-09-24-harambe-4-ever',49,'050'),('2026-09-24-harambe-4-ever',50,'051'),('2026-09-24-harambe-4-ever',51,'052'),('2026-09-24-harambe-4-ever',52,'053'),('2026-09-24-harambe-4-ever',53,'054'),('2026-09-24-harambe-4-ever',54,'055'),('2026-09-24-harambe-4-ever',55,'056'),
  ('2026-09-24-harambe-4-ever',56,'057'),('2026-09-24-harambe-4-ever',57,'058'),('2026-09-24-harambe-4-ever',58,'059'),('2026-09-24-harambe-4-ever',59,'060'),('2026-09-24-harambe-4-ever',60,'061'),('2026-09-24-harambe-4-ever',61,'062'),
  ('2026-09-25-wap',0,'001'),('2026-09-25-wap',1,'002'),('2026-09-25-wap',2,'003'),('2026-09-25-wap',3,'004'),('2026-09-25-wap',4,'005'),('2026-09-25-wap',5,'006'),('2026-09-25-wap',6,'007'),('2026-09-25-wap',7,'008'),
  ('2026-09-25-wap',8,'009'),('2026-09-25-wap',9,'010'),('2026-09-25-wap',10,'011'),('2026-09-25-wap',11,'012'),('2026-09-25-wap',12,'013'),('2026-09-25-wap',13,'014'),('2026-09-25-wap',14,'015'),('2026-09-25-wap',15,'016'),
  ('2026-09-25-wap',16,'017'),('2026-09-25-wap',17,'018'),('2026-09-25-wap',18,'019'),('2026-09-25-wap',19,'020'),('2026-09-25-wap',20,'021'),('2026-09-25-wap',21,'022'),('2026-09-25-wap',22,'023'),('2026-09-25-wap',23,'024'),
  ('2026-09-25-wap',24,'025'),('2026-09-25-wap',25,'026'),('2026-09-25-wap',26,'027'),('2026-09-25-wap',27,'028'),('2026-09-25-wap',28,'029'),('2026-09-25-wap',29,'030'),('2026-09-25-wap',30,'031'),('2026-09-25-wap',31,'032'),
  ('2026-09-25-wap',32,'033'),('2026-09-25-wap',33,'034'),('2026-09-25-wap',34,'035'),('2026-09-25-wap',35,'036'),('2026-09-25-wap',36,'037'),('2026-09-25-wap',37,'038'),('2026-09-25-wap',38,'039'),('2026-09-25-wap',39,'040'),
  ('2026-09-25-wap',40,'041'),('2026-09-25-wap',41,'042'),('2026-09-25-wap',42,'043'),('2026-09-25-wap',43,'044'),('2026-09-25-wap',44,'045'),
  ('2026-10-03-pulse-angels-3',0,'001'),('2026-10-03-pulse-angels-3',1,'002'),('2026-10-03-pulse-angels-3',2,'003'),('2026-10-03-pulse-angels-3',3,'004'),('2026-10-03-pulse-angels-3',4,'005'),('2026-10-03-pulse-angels-3',5,'006'),('2026-10-03-pulse-angels-3',6,'007'),('2026-10-03-pulse-angels-3',7,'008'),
  ('2026-10-03-pulse-angels-3',8,'009'),('2026-10-03-pulse-angels-3',9,'010'),('2026-10-03-pulse-angels-3',10,'011'),('2026-10-03-pulse-angels-3',11,'012'),('2026-10-03-pulse-angels-3',12,'013'),('2026-10-03-pulse-angels-3',13,'014'),('2026-10-03-pulse-angels-3',14,'015'),('2026-10-03-pulse-angels-3',15,'016'),
  ('2026-10-03-pulse-angels-3',16,'017'),('2026-10-03-pulse-angels-3',17,'018'),('2026-10-03-pulse-angels-3',18,'019'),('2026-10-03-pulse-angels-3',19,'020'),('2026-10-03-pulse-angels-3',20,'021'),('2026-10-03-pulse-angels-3',21,'022'),('2026-10-03-pulse-angels-3',22,'023'),('2026-10-03-pulse-angels-3',23,'024'),
  ('2026-10-03-pulse-angels-3',24,'025'),('2026-10-03-pulse-angels-3',25,'026'),('2026-10-03-pulse-angels-3',26,'027'),('2026-10-03-pulse-angels-3',27,'028'),('2026-10-03-pulse-angels-3',28,'029'),('2026-10-03-pulse-angels-3',29,'030'),('2026-10-03-pulse-angels-3',30,'031'),('2026-10-03-pulse-angels-3',31,'032'),
  ('2026-10-03-pulse-angels-3',32,'033'),('2026-10-03-pulse-angels-3',33,'034'),('2026-10-03-pulse-angels-3',34,'035'),('2026-10-03-pulse-angels-3',35,'036'),('2026-10-03-pulse-angels-3',36,'037'),('2026-10-03-pulse-angels-3',37,'038'),('2026-10-03-pulse-angels-3',38,'039'),('2026-10-03-pulse-angels-3',39,'040'),
  ('2026-10-03-pulse-angels-3',40,'041'),('2026-10-03-pulse-angels-3',41,'042'),('2026-10-03-pulse-angels-3',42,'043'),('2026-10-03-pulse-angels-3',43,'044'),('2026-10-03-pulse-angels-3',44,'045'),('2026-10-03-pulse-angels-3',45,'046'),('2026-10-03-pulse-angels-3',46,'047'),('2026-10-03-pulse-angels-3',47,'048');
-- <<< FRAME MAP

-- every positional tag gets its photo's name
update public.frame_tags t set media = m.media
  from public.frame_positions m
 where t.media is null and m.event_slug = t.event_slug and m.frame = t.frame;

do $$
declare unknown text; gone integer;
begin
  select string_agg(distinct t.event_slug, ', ' order by t.event_slug) into unknown
    from public.frame_tags t
   where t.media is null
     and not exists (select 1 from public.frame_positions m where m.event_slug = t.event_slug);
  if unknown is not null then
    raise exception 'Tags on a night the map does not know (%). Run framekeys.py on this file and paste it again.', unknown;
  end if;
  -- what is left sits past the end of a night the map knows: a frame that does not exist
  delete from public.frame_tags t where t.media is null;
  get diagnostics gone = row_count;
  if gone > 0 then raise notice 'tags on frames that do not exist, removed: %', gone; end if;
end $$;

-- the key: one tag per person per photo
alter table public.frame_tags alter column media set not null;
do $$
declare k text; cols text[];
begin
  select x.conname,
         (select array_agg(a.attname::text order by u.n)
            from unnest(x.conkey) with ordinality u(att, n)
            join pg_attribute a on a.attrelid = x.conrelid and a.attnum = u.att)
    into k, cols
    from pg_constraint x
   where x.conrelid = 'public.frame_tags'::regclass and x.contype = 'p';
  if cols is distinct from array['user_id', 'event_slug', 'media'] then
    if k is not null then execute format('alter table public.frame_tags drop constraint %I', k); end if;
    alter table public.frame_tags add constraint frame_tags_pkey primary key (user_id, event_slug, media);
  end if;
end $$;
alter table public.frame_tags alter column frame drop not null;
comment on column public.frame_tags.frame is 'position when tagged, informational only (043)';
create index if not exists frame_tags_night_idx on public.frame_tags (event_slug, media);


-- SECTION 2. The takedown log --------------------------------------------------------
-- files_gone_at null = the photo is still up on the night (takedown.py has not run for it yet)
create table if not exists public.frame_takedowns (
  event_slug    text not null check (event_slug ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$'),
  media         text not null check (media ~ '^[a-z0-9][a-z0-9_-]{0,40}$'),
  frame         integer check (frame is null or frame between 0 and 999),
  tags          jsonb not null default '[]'::jsonb,          -- the tags that came off: [{u, f, at}]
  tags_off      integer not null default 0,
  note          text check (note is null or char_length(note) <= 200),
  by_user       uuid references auth.users(id) on delete set null,   -- null = the laptop (takedown.py)
  created_at    timestamptz not null default now(),
  files_gone_at timestamptz,
  primary key (event_slug, media)
);
alter table public.frame_takedowns enable row level security;
revoke all on table public.frame_takedowns from public, anon, authenticated;

-- a night with a takedown keeps no positions, even when this file runs again with a fresh map
delete from public.frame_positions p using public.frame_takedowns d where d.event_slug = p.event_slug;


-- SECTION 3. Member doors ------------------------------------------------------------
-- I'm in this one, by the photo's name. p_frame is the position the page showed, kept for information.
create or replace function public.frame_tag_by_name(p_slug text, p_media text, p_on boolean, p_frame integer default null)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid(); m text := lower(btrim(coalesce(p_media, '')));
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  if p_slug is null or p_slug !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$' then raise exception 'No such night.' using errcode = '22023'; end if;
  if m !~ '^[a-z0-9][a-z0-9_-]{0,40}$' then raise exception 'No such photo.' using errcode = '22023'; end if;
  if p_frame is not null and (p_frame < 0 or p_frame > 999) then raise exception 'No such frame.' using errcode = '22023'; end if;
  if coalesce(p_on, true) then
    if exists (select 1 from public.frame_takedowns d where d.event_slug = p_slug and d.media = m) then
      raise exception 'That photo came down.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.frame_tags t where t.user_id = uid and t.event_slug = p_slug and t.media = m)
       and (select count(*) from public.frame_tags t where t.user_id = uid) >= 400 then
      raise exception 'That is a lot of frames. Untag a few first.' using errcode = '22023';
    end if;
    insert into public.frame_tags (user_id, event_slug, media, frame) values (uid, p_slug, m, p_frame)
    on conflict (user_id, event_slug, media) do nothing;
    return true;
  end if;
  delete from public.frame_tags t where t.user_id = uid and t.event_slug = p_slug and t.media = m;
  return false;
end
$fn$;
revoke execute on function public.frame_tag_by_name(text, text, boolean, integer) from public, anon;
grant  execute on function public.frame_tag_by_name(text, text, boolean, integer) to authenticated;

-- the OLD door, same signature as 037: a night page cached before the push sends a position. The map turns it into a
-- name. A position the map does not have (a made-up night, past the end, a night with a takedown) is a stale page.
create or replace function public.frame_tag(p_slug text, p_frame integer, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare uid uuid := auth.uid(); m text;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  if not coalesce(public.is_wall_member(), false) then raise exception 'Members only.' using errcode = '42501'; end if;
  select f.media into m from public.frame_positions f where f.event_slug = p_slug and f.frame = p_frame;
  if coalesce(p_on, true) then
    if m is null then raise exception 'This page is out of date. Reload it and tap again.' using errcode = '22023'; end if;
    return public.frame_tag_by_name(p_slug, m, true, p_frame);
  end if;
  -- once a photo's file has left the night, every later position moved: an old position could be another photo now
  if m is null and exists (select 1 from public.frame_takedowns d where d.event_slug = p_slug and d.files_gone_at is not null) then
    raise exception 'This page is out of date. Reload it and tap again.' using errcode = '22023';
  end if;
  delete from public.frame_tags t where t.user_id = uid and t.event_slug = p_slug and (t.frame = p_frame or t.media = m);
  return false;
end
$fn$;
revoke execute on function public.frame_tag(text, integer, boolean) from public, anon;
grant  execute on function public.frame_tag(text, integer, boolean) to authenticated;

-- the three readers gain a column, so they are dropped and made again (that resets their grants: set again below)
drop function if exists public.my_frames();
create function public.my_frames()
returns table (event_slug text, frame integer, created_at timestamptz, media text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.event_slug, t.frame, t.created_at, t.media from public.frame_tags t where t.user_id = auth.uid() order by t.created_at desc;
$fn$;
revoke execute on function public.my_frames() from public, anon;
grant  execute on function public.my_frames() to authenticated;

-- a member's tagged photos, for other members (their page); only when they show themselves on The Wall
drop function if exists public.frames_of(text);
create function public.frames_of(p_sid text)
returns table (event_slug text, frame integer, media text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.event_slug, t.frame, t.media
    from public.frame_tags t
   where coalesce(public.is_wall_member(), false)
     and public.wall_open(t.user_id)
     and public.wall_sid(t.user_id) = p_sid
   order by t.created_at desc
   limit 200;
$fn$;
revoke execute on function public.frames_of(text) from public, anon;
grant  execute on function public.frames_of(text) to authenticated;

-- who is in this night's photos, for members on the night page
drop function if exists public.frame_tags_of(text);
create function public.frame_tags_of(p_slug text)
returns table (frame integer, sid text, name text, media text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select t.frame, public.wall_sid(t.user_id), coalesce(nullif(btrim(pr.display_name), ''), 'Member'), t.media
    from public.frame_tags t join public.profiles pr on pr.id = t.user_id
   where coalesce(public.is_wall_member(), false)
     and t.event_slug = p_slug
     and public.wall_open(t.user_id)
   order by t.media, t.created_at;
$fn$;
revoke execute on function public.frame_tags_of(text) from public, anon;
grant  execute on function public.frame_tags_of(text) to authenticated;

-- the photos that came down, no names. Anyone may ask, but a photo the board took down that is
-- still on its night stays off the public list until takedown.py takes the file off (files_gone_at):
-- naming it early would point strangers at a photo someone asked to have removed. The desk sees all
-- of them (the board's THE TAKEDOWNS lists each one with its takedown.py command).
create or replace function public.frames_down(p_slug text default null)
returns table (event_slug text, media text) language sql stable security definer
set search_path = public, pg_temp as $fn$
  select d.event_slug, d.media
    from public.frame_takedowns d
   where (p_slug is null or d.event_slug = p_slug)
     and (d.files_gone_at is not null or coalesce(public.is_admin(), false))
   order by d.created_at desc
   limit 500;
$fn$;
revoke execute on function public.frames_down(text) from public;
grant  execute on function public.frames_down(text) to anon, authenticated;


-- SECTION 4. Desk doors --------------------------------------------------------------
-- every tag on a night, hidden and banned members included; open = their page shows on The Wall
create or replace function public.desk_frame_tags(p_slug text)
returns table (media text, frame integer, user_id uuid, sid text, name text, open boolean, created_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  return query
    select t.media, t.frame, t.user_id, public.wall_sid(t.user_id),
           coalesce(nullif(btrim(pr.display_name), ''), 'Member'),
           public.wall_open(t.user_id), t.created_at
      from public.frame_tags t left join public.profiles pr on pr.id = t.user_id
     where t.event_slug = p_slug
     order by t.media, t.created_at;
end
$fn$;
revoke execute on function public.desk_frame_tags(text) from public, anon;
grant  execute on function public.desk_frame_tags(text) to authenticated;

-- one person's tags
create or replace function public.desk_frames_of(p_user uuid)
returns table (event_slug text, media text, frame integer, created_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  return query
    select t.event_slug, t.media, t.frame, t.created_at
      from public.frame_tags t
     where t.user_id = p_user
     order by t.created_at desc;
end
$fn$;
revoke execute on function public.desk_frames_of(uuid) from public, anon;
grant  execute on function public.desk_frames_of(uuid) to authenticated;

-- take one photo down: its tags come off (kept in the log for an undo) and the night leaves the map, since every
-- position after it moves once takedown.py removes the file. No other tag moves. Returns how many tags came off, or -1
-- when the photo was already down. p_by null is the laptop (takedown.py, pasted in the SQL editor): that also marks the
-- file gone from the night. Not a door: the SQL editor and desk_frame_takedown only.
create or replace function public.frame_takedown_apply(p_slug text, p_media text, p_frame integer default null,
                                                       p_note text default null, p_by uuid default null)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare m text := lower(btrim(coalesce(p_media, ''))); nt text := left(nullif(btrim(coalesce(p_note, '')), ''), 200);
        stash jsonb; n integer;
begin
  if p_slug is null or p_slug !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$' then raise exception 'No such night.' using errcode = '22023'; end if;
  if m !~ '^[a-z0-9][a-z0-9_-]{0,40}$' then raise exception 'No such photo.' using errcode = '22023'; end if;
  if p_frame is not null and (p_frame < 0 or p_frame > 999) then raise exception 'No such frame.' using errcode = '22023'; end if;
  insert into public.frame_takedowns (event_slug, media, frame, note, by_user, files_gone_at)
  values (p_slug, m, p_frame, nt, p_by, case when p_by is null then now() end)
  on conflict (event_slug, media) do nothing;
  if not found then
    if p_by is null then
      update public.frame_takedowns d set files_gone_at = coalesce(d.files_gone_at, now())
       where d.event_slug = p_slug and d.media = m;
    end if;
    return -1;
  end if;
  with gone as (
    delete from public.frame_tags t where t.event_slug = p_slug and t.media = m
    returning t.user_id, t.frame, t.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('u', g.user_id, 'f', g.frame, 'at', g.created_at) order by g.created_at), '[]'::jsonb),
         count(*)::integer
    into stash, n
    from gone g;
  update public.frame_takedowns d set tags = stash, tags_off = n where d.event_slug = p_slug and d.media = m;
  delete from public.frame_positions f where f.event_slug = p_slug;
  return n;
end
$fn$;
revoke execute on function public.frame_takedown_apply(text, text, integer, text, uuid) from public, anon, authenticated;

create or replace function public.desk_frame_takedown(p_slug text, p_media text, p_frame integer default null, p_note text default null)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  return public.frame_takedown_apply(p_slug, p_media, p_frame, p_note, auth.uid());
end
$fn$;
revoke execute on function public.desk_frame_takedown(text, text, integer, text) from public, anon;
grant  execute on function public.desk_frame_takedown(text, text, integer, text) to authenticated;

-- put a photo back while it is still up on the night: its tags return (people who deleted their account since stay
-- gone) and the log row goes. Returns how many came back, 0 when nothing was down.
create or replace function public.desk_frame_takedown_undo(p_slug text, p_media text)
returns integer language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare m text := lower(btrim(coalesce(p_media, ''))); r public.frame_takedowns%rowtype; n integer;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  select * into r from public.frame_takedowns d where d.event_slug = p_slug and d.media = m for update;
  if not found then return 0; end if;
  if r.files_gone_at is not null then
    raise exception 'That photo is gone from the night. Undo is for photos still up.' using errcode = '55000';
  end if;
  insert into public.frame_tags (user_id, event_slug, media, frame, created_at)
  select (e.v ->> 'u')::uuid, r.event_slug, r.media, (e.v ->> 'f')::integer, coalesce((e.v ->> 'at')::timestamptz, now())
    from jsonb_array_elements(r.tags) as e(v)
   where exists (select 1 from auth.users u where u.id = (e.v ->> 'u')::uuid)
  on conflict (user_id, event_slug, media) do nothing;
  get diagnostics n = row_count;
  delete from public.frame_takedowns d where d.event_slug = r.event_slug and d.media = r.media;
  return n;
end
$fn$;
revoke execute on function public.desk_frame_takedown_undo(text, text) from public, anon;
grant  execute on function public.desk_frame_takedown_undo(text, text) to authenticated;

-- the takedowns, newest first. by_name is null for the laptop.
create or replace function public.desk_frame_takedowns()
returns table (event_slug text, media text, frame integer, tags_off integer, note text, by_name text,
               created_at timestamptz, files_gone_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $fn$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Desk only.' using errcode = '42501'; end if;
  return query
    select d.event_slug, d.media, d.frame, d.tags_off, d.note,
           case when d.by_user is not null then coalesce(nullif(btrim(pr.display_name), ''), 'Member') end,
           d.created_at, d.files_gone_at
      from public.frame_takedowns d left join public.profiles pr on pr.id = d.by_user
     order by d.created_at desc
     limit 200;
end
$fn$;
revoke execute on function public.desk_frame_takedowns() from public, anon;
grant  execute on function public.desk_frame_takedowns() to authenticated;


notify pgrst, 'reload schema';

-- SECTION 5. Verify: one row, every column should say true ---------------------------
select
  not exists (select 1 from public.frame_tags t where t.media is null) as every_tag_named,
  coalesce((select array_agg(a.attname::text order by u.n)
              from pg_constraint x
              cross join lateral unnest(x.conkey) with ordinality u(att, n)
              join pg_attribute a on a.attrelid = x.conrelid and a.attnum = u.att
             where x.conrelid = 'public.frame_tags'::regclass and x.contype = 'p') = array['user_id', 'event_slug', 'media'], false) as keyed_by_name,
  has_function_privilege('authenticated', 'public.frame_tag_by_name(text, text, boolean, integer)', 'execute') as member_tags_by_name,
  not (has_function_privilege('anon', 'public.frame_tag_by_name(text, text, boolean, integer)', 'execute')
       or has_function_privilege('anon', 'public.frame_tag(text, integer, boolean)', 'execute')
       or has_function_privilege('anon', 'public.my_frames()', 'execute')
       or has_function_privilege('anon', 'public.frames_of(text)', 'execute')
       or has_function_privilege('anon', 'public.frame_tags_of(text)', 'execute')
       or has_function_privilege('anon', 'public.desk_frame_tags(text)', 'execute')
       or has_function_privilege('anon', 'public.desk_frames_of(uuid)', 'execute')
       or has_function_privilege('anon', 'public.desk_frame_takedown(text, text, integer, text)', 'execute')
       or has_function_privilege('anon', 'public.desk_frame_takedown_undo(text, text)', 'execute')
       or has_function_privilege('anon', 'public.desk_frame_takedowns()', 'execute')) as stranger_cannot,
  coalesce(pg_get_functiondef(to_regprocedure('public.frame_tag(text, integer, boolean)')) like '%frame_positions%', false) as old_door_answers,
  ((select relrowsecurity from pg_class where oid = 'public.frame_positions'::regclass)
   and not has_table_privilege('anon', 'public.frame_positions', 'select, insert, update, delete, truncate, references, trigger')
   and not has_table_privilege('authenticated', 'public.frame_positions', 'select, insert, update, delete, truncate, references, trigger')) as positions_kept_private,
  ((select relrowsecurity from pg_class where oid = 'public.frame_takedowns'::regclass)
   and not has_table_privilege('anon', 'public.frame_takedowns', 'select, insert, update, delete, truncate, references, trigger')
   and not has_table_privilege('authenticated', 'public.frame_takedowns', 'select, insert, update, delete, truncate, references, trigger')
   and pg_get_functiondef('public.desk_frame_takedown(text, text, integer, text)'::regprocedure) like '%is_admin()%'
   and pg_get_functiondef('public.desk_frame_takedown_undo(text, text)'::regprocedure) like '%is_admin()%'
   and pg_get_functiondef('public.desk_frame_takedowns()'::regprocedure) like '%is_admin()%') as takedown_log_is_the_desks,
  not (has_function_privilege('anon', 'public.frame_takedown_apply(text, text, integer, text, uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.frame_takedown_apply(text, text, integer, text, uuid)', 'execute')) as raw_takedown_editor_only,
  has_function_privilege('anon', 'public.frames_down(text)', 'execute') as anyone_sees_what_came_down,
  pg_get_functiondef('public.desk_frame_tags(text)'::regprocedure) like '%is_admin()%' as desk_lists_tags;
