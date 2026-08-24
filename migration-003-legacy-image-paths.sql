-- 0FF THE PRINT — MIGRATION 003, run live 2026-08-20. Recorded for the history.
--
-- WHY: migration 002 added posts_image_url_ours, which requires a post's photo
-- to live under .../public/posts/<author_id>/. It was added NOT VALID because
-- one existing row failed it: KAV's post, uploaded before the <uid>/ path
-- existed, sat at a flat key.
--
-- THE TRAP: NOT VALID does not mean "not enforced". Existing rows are skipped
-- at ADD time, but every subsequent UPDATE re-checks the row. So KAV's post was
-- FROZEN: pin, pull, edit and restore all failed with 23514. Found by running a
-- pin round trip against the live desk, not by reading the SQL.
--
-- THE FIX: move the file into its author's folder so the DATA conforms, rather
-- than relaxing the constraint. Folder ownership is really enforced by the
-- storage policies (foldername(name)[1] = auth.uid()), so the CHECK is defence
-- in depth, but weakening it to unstick one row would have been the wrong trade.
--
-- Step 1 was a temporary admin UPDATE policy on storage.objects (002 leaves
-- UPDATE off on purpose so a live image cannot be overwritten in place), then
-- the move ran client side as admin:
--
--   storage.from('posts').move(
--     '1787212781973-xkboyw.jpeg',
--     'afb06e68-2579-4673-9950-56a32bc7ddef/1787212781973-xkboyw.jpeg')
--   posts.update({ image_url: <new public url> }).eq('id', 2)
--
-- Step 2 is everything below.

begin;

-- Moving the photo tripped the content-changed test and stamped the post
-- EDITED. Nobody touched KAV's words. A false EDITED pill on a member's post is
-- exactly the kind of small lie this site is not supposed to tell, and the
-- guard trigger preserves the old stamp when content is unchanged, so it cannot
-- be cleared by a plain update.
alter table public.posts disable trigger trg_posts_guard_update;
update public.posts set edited_at = null where id = 2;
alter table public.posts enable  trigger trg_posts_guard_update;

-- Put storage.objects back the way 002 wanted it.
drop policy if exists "admin moves uploads" on storage.objects;

-- Every image now lives in its author's own folder, so this can finally be real.
alter table public.posts validate constraint posts_image_url_ours;

commit;

-- Verified after running: edited stamp cleared true, constraint validated true,
-- temp storage policy gone true, stray flat objects 0.
