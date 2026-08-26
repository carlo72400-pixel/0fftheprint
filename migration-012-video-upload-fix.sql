-- ============================================================================
-- 0FF THE PRINT, MIGRATION 012: VIDEO UPLOADS ACTUALLY UPLOAD
-- Project ref: frqpvcpyglhmerwpvosl          Written 2026-08-26
--
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- THE BUG, reproduced live before this was written (a real .mp4 upload from an
-- approved logged-in session): `new row violates row-level security policy`,
-- 403. Migration 004 widened the BUCKET's allowed_mime_types to video and its
-- ceiling to 50MB, but never touched the "approved members upload" policy,
-- whose filename rule still ends in image extensions only. The bucket said
-- yes, the policy said no, and every member video upload has been dead since
-- video "shipped". This is KAV's failed video post.
--
-- THE FIX is the same policy from migration 002, verbatim, with the extension
-- list finally matching what the bucket, the client (desk.js EXTS), and the
-- compose page have all believed for weeks: images + mp4/mov/webm/m4v.
-- ============================================================================

drop policy if exists "approved members upload" on storage.objects;
create policy "approved members upload" on storage.objects
  for insert with check (
    bucket_id = 'posts'
    and public.is_approved()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~* '^[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,80}\.(jpg|jpeg|png|webp|gif|heic|heif|avif|mp4|mov|webm|m4v)$'
  );

-- ============================================================================
-- VERIFY. The policy's own definition is the receipt.
-- ============================================================================
select 'upload policy covers video' as check,
       (position('mp4' in pg_get_expr(pol.polqual, pol.polrelid)) > 0
        or position('mp4' in pg_get_expr(pol.polwithcheck, pol.polrelid)) > 0)::text as ok
  from pg_policy pol
 where pol.polname = 'approved members upload';

-- ⛔ AFTER RUNNING: the reproduction that failed must now pass. From the desk
-- console on 0fftheprint.com (any approved session):
--   OTP.uploadImage(new File([new Uint8Array(32)], 'probe.mp4', {type:'video/mp4'}))
-- must resolve to a public URL instead of a 403.
