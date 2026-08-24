-- 0FF THE PRINT — MIGRATION 004: photos, GIFs and video on a post.
-- His ask: "add photos or GIFs or videos".
--
-- 50MB is the ceiling the Supabase FREE tier allows per upload, so that is the
-- honest cap until media moves to real hosting. A 50MB budget is roughly 20 to
-- 30 seconds of decent 1080p, which is a clip, not a film. The compose box says
-- so out loud rather than letting somebody wait through a doomed upload.

begin;

update storage.buckets
   set file_size_limit = 52428800,          -- 50MB, the free tier ceiling
       allowed_mime_types = array[
         -- stills
         'image/jpeg','image/jpg','image/png','image/webp','image/gif',
         'image/heic','image/heif','image/avif',
         -- motion. quicktime is what an iPhone actually hands you.
         'video/mp4','video/quicktime','video/webm','video/x-m4v'
       ]
 where id = 'posts';

-- The column has always been called image_url and now it carries video too.
-- Renaming it would break every reader on the site for no gain, so it stays and
-- this comment is the honest record of what it means.
comment on column public.posts.image_url is
  'Public URL of the attached MEDIA (photo, GIF or video), not just an image. Name kept for compatibility.';

commit;

select 'size limit'  as check, (select (file_size_limit/1048576)::text || 'MB' from storage.buckets where id='posts') as val
union all
select 'video allowed', (select (allowed_mime_types @> array['video/mp4','video/quicktime'])::text from storage.buckets where id='posts');
