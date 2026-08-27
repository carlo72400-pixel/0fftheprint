/* 0FF THE PRINT — shared auth + posting helpers.
   Loaded by /join/, /compose/, /desk/ and the timeline on the homepage.
   Everything degrades quietly when the backend is not configured yet.

   Every method here is a REQUEST, not a permission. The database decides.
   If a call comes back with zero rows it means RLS refused, which is the
   correct answer, and the message says so in plain words. */
(function (w) {
  const CFG = w.OTP_SUPABASE || {};
  const READY = !!(CFG.url && CFG.anonKey);

  const FEED_CAP = 8;                       // how many posts the homepage shows
  const NO_DASH = t => String(t == null ? "" : t).replace(/—/g, ",");
  const STILL_EXTS = ["jpg", "png", "webp", "gif", "heic", "heif", "avif"];
  const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v"];
  const EXTS = STILL_EXTS.concat(VIDEO_EXTS);
  const MIME = {
    jpg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
    // quicktime is what an iPhone actually hands you when you pick a clip
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v",
  };
  const MAX_BYTES = 50 * 1024 * 1024;          // the Supabase free tier ceiling
  // Used by the renderers to decide between <img> and <video>. Extension only,
  // because the URL is all the public timeline ever has to go on.
  const isVideo = url => VIDEO_EXTS.indexOf(
    (String(url || "").split(/[?#]/)[0].split(".").pop() || "").toLowerCase()) !== -1;
  // Pull the storage object key back out of a public URL. uploadImage only ever
  // returned the URL, so without this nothing could delete the file afterwards
  // and the bucket filled up with photos belonging to deleted posts.
  const objectName = url => {
    const bits = String(url || "").split("/storage/v1/object/public/posts/");
    return bits.length < 2 ? null : (bits[1].split(/[?#]/)[0] || null);
  };

  let client = null;
  function sb() {
    if (!READY) return null;
    if (!client) {
      if (!w.supabase || !w.supabase.createClient) return null;
      client = w.supabase.createClient(CFG.url, CFG.anonKey);
    }
    return client;
  }

  const OTP = {
    configured: READY,
    sb,
    FEED_CAP,

    async me() {
      const c = sb(); if (!c) return null;
      const { data: { user } } = await c.auth.getUser();
      if (!user) return null;

      // Preferred path: is_admin stops being a readable column once migration
      // 002 lands, so it comes back through an RPC that only ever returns the
      // caller's own row. Nobody gets to enumerate who runs the desk.
      const rpc = await c.rpc("my_profile");
      if (!rpc.error && rpc.data && rpc.data[0]) {
        return { user, profile: rpc.data[0] };
      }
      // Fallback for the pre-002 schema, so this file is safe to deploy before
      // the migration runs. Remove once 002 is live everywhere.
      const { data: profile } = await c
        .from("profiles")
        .select("id, display_name, card_slug, approved, is_admin")
        .eq("id", user.id)
        .single();
      return { user, profile: profile || null };
    },

    async signUp(email, password, displayName, cardSlug, instagram) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const ig = String(instagram || "").trim().replace(/^@/, "").toLowerCase();
      const { error } = await c.auth.signUp({
        email, password,
        options: { data: {
          display_name: displayName,
          card_slug: cardSlug,
          // handle only; the trigger sanitizes again server side
          instagram: /^[a-z0-9._]{1,30}$/.test(ig) ? ig : "",
        } },
      });
      if (error) throw error;
    },

    async signIn(email, password) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async signOut() {
      const c = sb(); if (!c) return;
      await c.auth.signOut();
    },

    // ---- password reset, through the email and nothing else --------------
    // Supabase mails a one-time recovery link that lands on /reset/ with a
    // short-lived session. Nobody (including the desk) can set a password for
    // somebody; the link in the inbox is the whole proof of identity.
    async requestPasswordReset(email) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const e = String(email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Put your email in the email box first.");
      const { error } = await c.auth.resetPasswordForEmail(e, {
        redirectTo: "https://0fftheprint.com/reset/",
      });
      if (error) throw error;
    },

    // Only works while the recovery-link session is live on /reset/.
    async completePasswordReset(pw) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      if (String(pw || "").length < 8) throw new Error("8 characters or more.");
      const { error } = await c.auth.updateUser({ password: pw });
      if (error) throw error;
    },

    /* ---- images ---- */
    isVideo,

    async uploadImage(file) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const m = /\.([A-Za-z0-9]+)$/.exec(file.name || "");
      let ext = (m ? m[1] : "").toLowerCase();
      if (ext === "jpeg") ext = "jpg";
      if (ext === "qt") ext = "mov";
      if (EXTS.indexOf(ext) === -1) {
        // Fall back to what the picker claimed before giving up on it.
        const t = String(file.type || "");
        if (/^video\//.test(t)) ext = "mp4";
        else if (/^image\//.test(t)) ext = "jpg";
        else throw new Error("Photos, GIFs and video clips only.");
      }
      if (file.size > MAX_BYTES) {
        throw new Error(VIDEO_EXTS.indexOf(ext) !== -1
          ? "That clip is over 50MB. Trim it or drop the quality a notch."
          : "That photo is over 50MB, which is a lot of photo. Shrink it first.");
      }

      // The key MUST start with <uid>/ or the storage policy refuses it. That is
      // what stops one member from touching another member's photos.
      const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await c.storage.from("posts").upload(name, file, {
        cacheControl: "3600",
        upsert: false,
        // Explicit, because phones lie. Some Android pickers report image/jpg,
        // some report nothing at all, and the bucket allowlist bounces both.
        contentType: MIME[ext] || "image/jpeg",
      });
      if (error) throw error;
      return c.storage.from("posts").getPublicUrl(name).data.publicUrl;
    },

    async deleteImage(url) {
      const c = sb(); if (!c) return;
      const name = objectName(url);
      if (!name) return;
      const { error } = await c.storage.from("posts").remove([name]);
      if (error) throw error;
    },

    /* ---- posting: your own stuff, no approval needed ---- */
    async post({ text, imageUrl, imageAlt }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const { data, error } = await c.from("posts").insert({
        author_id: user.id,
        text: NO_DASH(text),
        image_url: imageUrl || null,
        image_alt: imageAlt || null,
      }).select("id, text, image_url, image_alt, published, created_at, edited_at").single();
      if (error) throw error;
      return data;
    },

    async updatePost(id, { text, imageUrl, imageAlt }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (text !== undefined)     patch.text = NO_DASH(text);
      if (imageUrl !== undefined) patch.image_url = imageUrl || null;
      if (imageAlt !== undefined) patch.image_alt = imageAlt || null;
      const { data, error } = await c.from("posts").update(patch).eq("id", id)
        .select("id, text, image_url, image_alt, published, created_at, edited_at");
      if (error) throw error;
      // Zero rows means RLS refused, not that the post vanished.
      if (!data || !data.length) {
        throw new Error("That one is not yours to edit any more. The desk has it.");
      }
      return data[0];
    },

    async deletePost(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("posts").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) {
        throw new Error("That one is not yours to delete any more. The desk has it.");
      }
    },

    // The six keys, frozen. The column is a Postgres enum, so a bad value is
    // rejected by the database too, not just here.
    ACCENTS: ['acid','gold','ember','pink','violet','ice'],

    async setAccent(key) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const v = OTP.ACCENTS.indexOf(key) !== -1 ? key : null;
      const { error } = await c.from("profiles").update({ accent: v }).eq("id", user.id);
      if (error) throw error;
      return v;
    },

    // ---- THE CARD BUILDER (migration 007) --------------------------------
    // Frames a member may pick without a grant. Kept in step with the CHECK in
    // migration-007: `card_frame in (...) or card_frame = frame_grant`. This
    // list is a CONVENIENCE for the picker, never the gate. The gate is the
    // database, so a crafted request is refused whatever this array says.
    OPEN_FRAMES: ["common", "uncommon", "rare", "rare-holo"],

    // Every frame that has CSS behind it, for labelling a granted one.
    ALL_FRAMES: ["common", "uncommon", "rare", "rare-holo", "rainbow-rare",
      "tera-ex", "gold-rare", "full-art", "darklord", "warlord", "amazing",
      "diamond-rare", "vampy", "stone", "tag-team"],

    LINK_PLATFORMS: ["instagram", "tiktok", "youtube", "spotify", "soundcloud", "bandcamp"],

    // Pull the bare 22-char id out of whatever a member pasted. Mirrors
    // parseSpotifyId() in index.html. Storing the ID and never a URL is what
    // makes a scheme unrepresentable in the column.
    trackId(s) {
      if (!s) return null;
      const v = String(s);
      const m = v.match(/(?:track\/|spotify:track:)([A-Za-z0-9]{22})/) ||
                v.match(/^([A-Za-z0-9]{22})$/);
      return m ? m[1] : null;
    },

    async saveCard(fields) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const patch = {};
      if ("card_frame" in fields) patch.card_frame = fields.card_frame || null;
      if ("card_photo" in fields) patch.card_photo = fields.card_photo || null;
      if ("theme_start" in fields) {
        const n = parseInt(fields.theme_start, 10);
        patch.theme_start = Number.isFinite(n) && n > 0 ? Math.min(n, 3600) : null;
      }
      if ("theme_song" in fields) patch.theme_track = OTP.trackId(fields.theme_song);
      if ("link_platform" in fields) patch.link_platform = fields.link_platform || null;
      if ("link_handle" in fields) {
        const h = String(fields.link_handle || "").trim().replace(/^@/, "");
        patch.link_handle = /^[A-Za-z0-9._-]{1,30}$/.test(h) ? h : null;
      }
      const { error } = await c.from("profiles").update(patch).eq("id", user.id);
      // The database is the gate, so surface WHY rather than a raw code.
      if (error) {
        if (error.code === "22P02") throw new Error("That frame does not exist.");
        if (error.code === "23514") throw new Error("That frame is not yours to pick yet.");
        if (error.code === "42501") throw new Error("That photo is not in your folder.");
        throw error;
      }
      return patch;
    },

    // ---- THE WORD (migration 008): story overrides + member entries ------
    async storyOverride(slug) {
      const c = sb(); if (!c) return null;
      const { data, error } = await c.from("story_pages")
        .select("slug,body_md,stamp,updated_at").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async saveStoryOverride(slug, bodyMd, stamp) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("story_pages")
        .upsert({ slug, body_md: NO_DASH(bodyMd), stamp: stamp || null });
      if (error) throw error;
    },

    async clearStoryOverride(slug) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("story_pages").delete().eq("slug", slug);
      if (error) throw error;
    },

    async wall(slug) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("word_wall")
        .select("id,story_slug,text,created_at,display_name,card_slug")
        .eq("story_slug", slug).order("created_at");
      if (error) throw error;
      return data || [];
    },

    async myEntries(slug) {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("word_entries")
        .select("id,story_slug,text,published,created_at")
        .eq("author_id", user.id).eq("story_slug", slug);
      if (error) throw error;
      return data || [];
    },

    // Every entry of mine across every story, for the member desk.
    async myEntriesAll() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("word_entries")
        .select("id,story_slug,text,published,created_at")
        .eq("author_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async submitEntry(slug, text) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const t = NO_DASH(text).trim();
      if (!t) throw new Error("Say something first.");
      if (t.length > 500) throw new Error("500 characters. Trim it.");
      const { error } = await c.from("word_entries")
        .insert({ story_slug: slug, author_id: user.id, text: t });
      if (error) {
        if (error.code === "23505") throw new Error("Yours is already on the desk for this one.");
        throw error;
      }
    },

    async withdrawEntry(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("word_entries").delete()
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("The desk already has that one.");
    },

    // desk: everything pending + everything on the walls
    async deskWord() {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("word_entries")
        .select("id,story_slug,text,published,created_at, profiles(display_name,card_slug)")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },

    async setEntryPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("word_entries")
        .update({ published: !!on }).eq("id", id);
      if (error) throw error;
    },

    async deleteEntry(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("word_entries").delete().eq("id", id);
      if (error) throw error;
    },

    // ---- SEED OVERRIDES (migration 011) ----------------------------------
    // Seeds have no ids, so the key is a content hash. Python (bake.py) and
    // this function MUST hash identically: sha256(author + '|' + text), first
    // 16 hex. Editing the seed in git changes the hash, which is the feature:
    // a baked-in edit makes its override inert on its own.
    async seedKey(author, text) {
      const data = new TextEncoder().encode(String(author || "") + "|" + String(text || ""));
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    },

    async seedOverrides() {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("seed_overrides").select("key,hidden,new_text");
      if (error) throw error;
      return data || [];
    },

    async setSeedOverride(key, { hidden, newText }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const row = { key, hidden: !!hidden, new_text: newText || null };
      const { error } = await c.from("seed_overrides").upsert(row);
      if (error) throw error;
    },

    async clearSeedOverride(key) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("seed_overrides").delete().eq("key", key);
      if (error) throw error;
    },

    // ---- MEMBER STORIES (migration 010) ----------------------------------
    slugifyTitle(t) {
      return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "").slice(0, 60);
    },

    async submitStory({ title, dek, body, coverUrl }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const slug = OTP.slugifyTitle(title);
      if (slug.length < 3) throw new Error("That title needs more to it.");
      if (/^!\[/m.test(body || "")) throw new Error("Images inside the story are not a thing yet. One cover photo is.");
      const { error } = await c.from("member_stories").insert({
        author_id: user.id, slug,
        title: NO_DASH(title).trim(),
        dek: NO_DASH(dek).trim(),
        body_md: NO_DASH(body),
        cover_url: coverUrl || null,
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error(error.message.indexOf("one_pending") !== -1
            ? "You already have one on the desk. One at a time."
            : "A story already runs under that title. Pick another.");
        }
        throw error;
      }
      return slug;
    },

    async updateMyStory(id, { title, dek, body, coverUrl }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (title !== undefined) patch.title = NO_DASH(title).trim();
      if (dek !== undefined) patch.dek = NO_DASH(dek).trim();
      if (body !== undefined) {
        if (/^!\[/m.test(body || "")) throw new Error("Images inside the story are not a thing yet. One cover photo is.");
        patch.body_md = NO_DASH(body);
      }
      if (coverUrl !== undefined) patch.cover_url = coverUrl || null;
      const { data, error } = await c.from("member_stories")
        .update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("That one is live. Edits go through the desk now.");
    },

    async withdrawStory(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("member_stories").delete()
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("That one is live. The desk pulls it.");
    },

    async myStories() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("member_stories")
        .select("id,slug,title,dek,body_md,cover_url,published,baked,created_at")
        .eq("author_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    // Published, unbaked member stories for the homepage overlay. Baked ones
    // are skipped because the committed desk.json floor carries them by then.
    async wordStories(limit = 8) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("word_stories")
        .select("slug,title,dek,cover_url,baked,created_at,display_name,card_slug")
        .eq("baked", false)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    },

    async wordStory(slug) {
      const c = sb(); if (!c) return null;
      const { data, error } = await c.from("word_stories")
        .select("slug,title,dek,body_md,cover_url,created_at,display_name,card_slug")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    // The reader's fallback: RLS decides who sees an unpublished story
    // (its author, or the desk). Anon gets published rows only.
    async storyAnyRole(slug) {
      const c = sb(); if (!c) return null;
      const { data, error } = await c.from("member_stories")
        .select("slug,title,dek,body_md,cover_url,published,created_at")
        .eq("slug", slug).maybeSingle();
      if (error) return null;
      return data || null;
    },

    async deskStories() {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("member_stories")
        .select("id,slug,title,dek,body_md,published,baked,created_at, profiles(display_name)")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },

    async setStoryPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("member_stories")
        .update({ published: !!on }).eq("id", id);
      if (error) throw error;
    },

    // The laptop's mark, tapped from the desk after bake.py + push: the git
    // floor carries the story now, so the overlay lets go of it.
    async setStoryBaked(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("member_stories")
        .update({ baked: true }).eq("id", id);
      if (error) throw error;
    },

    // The desk's story editor. updateMyStory is author-scoped and its RLS
    // refuses a PUBLISHED row ("That one is live. Edits go through the desk
    // now."), so once a story was approved NOBODY could fix a typo in it. This
    // is the "through the desk" half that message always promised.
    async updateStory(id, { title, dek, body }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (title !== undefined) patch.title = NO_DASH(title).trim();
      if (dek !== undefined) patch.dek = NO_DASH(dek).trim();
      if (body !== undefined) {
        if (/^!\[/m.test(body || "")) throw new Error("Images inside the story are not a thing yet. One cover photo is.");
        patch.body_md = NO_DASH(body);
      }
      const { data, error } = await c.from("member_stories")
        .update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("Could not write that story.");
    },

    async updateVideo(id, { title, coverUrl }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (title !== undefined) patch.title = NO_DASH(title).trim().slice(0, 80);
      if (coverUrl !== undefined) patch.cover_url = coverUrl || null;
      const { data, error } = await c.from("featured_videos")
        .update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("Could not write that video.");
    },

    async deleteStory(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("member_stories").delete().eq("id", id);
      if (error) throw error;
    },

    // ---- FEATURED VIDEOS (migration 014) ---------------------------------
    // The video is a LINK, never a file. Supabase free is 1GB of storage and
    // 5GB/mo of egress shared with auth, so uploading clips would buy ~22
    // videos and ~111 views a month sitewide and take the login down with it.
    // Members already host on TikTok and YouTube.
    //
    // videoKey parses a pasted URL into {provider, vid}. The DB shape-checks
    // the id per provider and the view rebuilds the host, so nothing a member
    // types ever reaches the page as a URL.
    videoKey(raw) {
      const s = String(raw || "").trim();
      if (!s) return null;
      let m;
      // youtube: watch?v=, youtu.be/, /shorts/, /embed/
      m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(s);
      if (m) return { provider: "youtube", vid: m[1] };
      // tiktok: /video/<digits>, and the short vm./vt. links cannot be resolved
      // client-side (they 302 and the redirect is opaque to fetch), so they are
      // rejected with a message that tells the member what to paste instead.
      m = /tiktok\.com\/[^\s]*\/video\/(\d{17,21})/.exec(s);
      if (m) return { provider: "tiktok", vid: m[1] };
      if (/(?:vm|vt)\.tiktok\.com\//.test(s)) return { short: "tiktok" };
      // instagram reels
      m = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]{5,30})/.exec(s);
      if (m) return { provider: "instagram", vid: m[1] };
      return null;
    },

    async submitVideo({ url, title, coverUrl }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const k = OTP.videoKey(url);
      if (k && k.short === "tiktok")
        throw new Error("That is a short TikTok link. Open the video and copy the address bar link instead.");
      if (!k) throw new Error("That is not a YouTube, TikTok or Instagram video link.");
      const t = NO_DASH(String(title || "").trim()).slice(0, 80);
      if (!t) throw new Error("Give it a title.");
      const { error } = await c.from("featured_videos").insert({
        submitted_by: user.id, provider: k.provider, vid: k.vid,
        title: t, cover_url: coverUrl || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("That video is already up.");
        throw error;
      }
      return k;
    },

    // The public rail. `by` is the member's card slug, which is what the
    // per-member tabs group on.
    async videos(limit = 60) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("videos")
        .select("id,provider,vid,title,link,cover,featured,by,by_name,created_at")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    async myVideos() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("featured_videos")
        .select("id,provider,vid,title,cover_url,published,featured,created_at")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async videosAll() {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("featured_videos")
        .select("id,submitted_by,provider,vid,title,cover_url,published,featured,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async setVideoPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("featured_videos").update({ published: !!on }).eq("id", id);
      if (error) throw error;
    },

    async setVideoFeatured(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("featured_videos").update({ featured: !!on }).eq("id", id);
      if (error) throw error;
    },

    async deleteVideo(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      // Read the cover FIRST. 014 has no orphan trigger (002's is posts-only),
      // so a bare row delete left the cover in the 1GB posts bucket forever.
      let key = null;
      try {
        const { data } = await c.from("featured_videos")
          .select("cover_url").eq("id", id).maybeSingle();
        key = data ? objectName(data.cover_url) : null;   // the same parser posts use
      } catch (e) { /* the row still has to go */ }
      const { error } = await c.from("featured_videos").delete().eq("id", id);
      if (error) throw error;
      // Best effort: the row is already gone, so a failed unlink must not throw
      // back at the desk. It just leaves one file, same as the orphan card.
      if (key) { try { await c.storage.from("posts").remove([key]); } catch (e) {} }
    },

    // ---- SITE OVERRIDES, the front-page CMS (migration 014) ---------------
    // work.json / slate.json / roster.json are committed files and a browser
    // cannot write to git, so the desk edits an overlay and bake.py folds it
    // back down. Same shape as seed_overrides in 011.
    async siteOverrides(section) {
      const c = sb(); if (!c) return [];
      let q = c.from("site_overrides").select("section,item_key,patch,hidden,sort,updated_at");
      if (section) q = q.eq("section", section);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    async setSiteOverride(section, itemKey, patch, opts) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const row = {
        section, item_key: itemKey || "",
        patch: patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {},
      };
      if (opts && "hidden" in opts) row.hidden = !!opts.hidden;
      if (opts && "sort" in opts) row.sort = opts.sort;
      const { error } = await c.from("site_overrides")
        .upsert(row, { onConflict: "section,item_key" });
      if (error) throw error;
    },

    async clearSiteOverride(section, itemKey) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("site_overrides").delete()
        .eq("section", section).eq("item_key", itemKey || "");
      if (error) throw error;
    },

    // ---- MUSIC ON ROTATION (migration 009) -------------------------------
    // Submit resolves title + cover through Spotify's oEmbed (CORS-open,
    // verified live). The DB stores the track id and a 40-hex cover key,
    // never a URL a member typed.
    // Shared by submit AND swap so the two can never drift on what a Spotify
    // link resolves to. Returns the id, the title and the 40-hex art key.
    async resolveTrack(url) {
      const id = OTP.trackId(url);
      if (!id) throw new Error("That is not a Spotify track link.");
      let meta;
      try {
        meta = await fetch("https://open.spotify.com/oembed?url=https://open.spotify.com/track/" + id)
          .then(r => r.ok ? r.json() : null);
      } catch (e) { meta = null; }
      if (!meta || !meta.title) throw new Error("Could not read that track. Try again in a minute.");
      const km = /\/image\/([a-f0-9]{40})$/.exec(meta.thumbnail_url || "");
      return { id, title: NO_DASH(meta.title).slice(0, 60), artKey: km ? km[1] : null,
               thumb: meta.thumbnail_url || null };
    },

    // Swap the song on a row you already own. Migration 016 added the update
    // policy that made this possible at all, and its guard flips published to
    // false whenever the track id changes, so a swap goes back to the desk.
    // Changing only the artist does not unpublish it.
    async updateTrack(id, { url, artist }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (url !== undefined && String(url).trim()) {
        const r = await OTP.resolveTrack(url);
        patch.track = r.id; patch.title = r.title; patch.art_key = r.artKey;
      }
      if (artist !== undefined) patch.artist = NO_DASH(artist).trim().slice(0, 40) || "unknown";
      if (!Object.keys(patch).length) return;
      const { data, error } = await c.from("rotation_tracks")
        .update(patch).eq("id", id).select("id,published");
      if (error) {
        if (error.code === "23505") throw new Error("That song is already on the shelf.");
        throw error;
      }
      if (!data || !data.length) throw new Error("That one is not yours to change.");
      return data[0];
    },

    async submitTrack({ url, artist }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const id = OTP.trackId(url);
      if (!id) throw new Error("That is not a Spotify track link.");
      let meta;
      try {
        meta = await fetch("https://open.spotify.com/oembed?url=https://open.spotify.com/track/" + id)
          .then(r => r.ok ? r.json() : null);
      } catch (e) { meta = null; }
      if (!meta || !meta.title) throw new Error("Could not read that track. Try again in a minute.");
      const km = /\/image\/([a-f0-9]{40})$/.exec(meta.thumbnail_url || "");
      const { error } = await c.from("rotation_tracks").insert({
        submitted_by: user.id,
        track: id,
        title: NO_DASH(meta.title).slice(0, 60),
        artist: NO_DASH(artist || "").trim().slice(0, 40) || "unknown",
        art_key: km ? km[1] : null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("That one is already on the shelf.");
        throw error;
      }
      return { title: meta.title, art: meta.thumbnail_url || null };
    },

    async rotation(limit = 12) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("rotation")
        .select("track,title,artist,link,art,by,created_at")
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data || []).map(t => ({
        platform: "spotify", title: t.title, artist: t.artist,
        art: t.art, link: t.link, by: t.by, track: t.track, live: true,
      }));
    },

    async myRotation() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("rotation_tracks")
        .select("id,track,title,artist,published,created_at")
        .eq("submitted_by", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async withdrawTrack(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("rotation_tracks").delete()
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("That one is on rotation. The desk pulls it.");
    },

    async rotationAll() {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("rotation_tracks")
        .select("id,track,title,artist,art_key,published,created_at, profiles(display_name,card_slug)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async setTrackPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("rotation_tracks")
        .update({ published: !!on }).eq("id", id);
      if (error) throw error;
    },

    async deleteTrack(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("rotation_tracks").delete().eq("id", id);
      if (error) throw error;
    },

    // Public card overlay for the homepage: every approved member's saved card
    // fields in one request (the `cards` view folds featured tracks in with
    // jsonb_agg, so this is ONE round trip, not one per member).
    async cards() {
      const c = sb(); if (!c) return [];
      // 018 widened the view with the words on the back of the card. Asking for
      // a column the view does not have yet is a 42703, not an empty field, so
      // this falls back rather than taking the homepage down with it on a site
      // whose database has not been migrated.
      const WIDE = "card_slug,display_name,tagline,bio,accent,card_frame,card_photo," +
                   "theme_song,theme_start,link_platform,link_handle,featured";
      const NARROW = "card_slug,card_frame,card_photo,theme_song,theme_start," +
                     "link_platform,link_handle,featured";
      let r = await c.from("cards").select(WIDE);
      if (r.error) {
        console.warn("cards: falling back to the pre-018 shape,", r.error.message);
        r = await c.from("cards").select(NARROW);
      }
      if (r.error) throw r.error;
      return r.data || [];
    },

    // ---- THE BACK OF THE CARD (migration 018) ---------------------------
    // Every public view already carries card_slug, so a member's page is five
    // filters, not five new tables. Fired together because they do not depend
    // on each other and a phone should not wait for them in series. Each one
    // falls back to empty on its own: a member with no videos yet must still
    // get a page, and a view that is missing because a migration has not run
    // must cost that rail only.
    async cardBack(slug) {
      const c = sb(); if (!c || !slug) return null;
      const one = async (fn) => { try { return await fn(); } catch (e) {
        console.warn("card back:", e.message); return []; } };

      const card = await one(async () => {
        const { data, error } = await c.from("cards").select("*")
          .eq("card_slug", slug).maybeSingle();
        if (error) throw error;
        return data;
      });
      if (!card || Array.isArray(card)) return null;    // no such card holder

      const [posts, stories, videos, track] = await Promise.all([
        one(async () => {
          const { data, error } = await c.from("feed")
            .select("id,text,image_url,image_alt,pinned,created_at,edited_at,display_name,card_slug")
            .eq("card_slug", slug)
            // A view's ORDER BY is not guaranteed to survive LIMIT, which is
            // written on public.feed itself. Restate it here.
            .order("pinned", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(60);
          if (error) throw error;
          return data || [];
        }),
        one(async () => {
          const { data, error } = await c.from("word_stories")
            .select("slug,title,dek,cover_url,baked,created_at")
            .eq("card_slug", slug).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        }),
        one(async () => {
          const { data, error } = await c.from("videos")
            .select("id,provider,vid,title,link,cover,featured,created_at")
            .eq("by", slug).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        }),
        one(async () => {
          const { data, error } = await c.from("rotation")
            .select("track,title,artist,link,art,created_at")
            .eq("by", slug).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        }),
      ]);
      return { card, posts, stories, videos, tracks: track };
    },

    // The two things a card holder types. Everything else on their page is
    // assembled from work they already did somewhere else on the site.
    // The DB caps the length and strips em-dashes; this only trims and turns an
    // emptied box into a real NULL so the page can tell "blank" from "unset".
    async saveMyWords({ tagline, bio }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const patch = {};
      if (tagline !== undefined) patch.tagline = String(tagline || "").trim() || null;
      if (bio !== undefined) patch.bio = String(bio || "").trim() || null;
      const { error } = await c.from("profiles").update(patch).eq("id", user.id);
      if (error) {
        if (error.code === "23514")
          throw new Error("Too long. A tagline is one line up to 80, a bio is up to 600.");
        throw error;
      }
    },

    // Their own words even before the desk approves them, which the public
    // `cards` view cannot return because it reads through the anon policy.
    async myWords() {
      const c = sb(); if (!c) return null;
      const { data: { user } } = await c.auth.getUser();
      if (!user) return null;
      const { data, error } = await c.from("profiles")
        .select("tagline,bio,card_slug,display_name").eq("id", user.id).maybeSingle();
      if (error) return null;
      return data || null;
    },

    async myFeatured() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("featured_tracks")
        .select("slot,track").eq("profile_id", user.id).order("slot");
      if (error) throw error;
      return data || [];
    },

    // Replace all three slots in one go. Delete-then-insert, because a member
    // reordering their three would otherwise trip `unique (profile_id, track)`
    // mid-update.
    async setFeatured(list) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const rows = [];
      const seen = new Set();
      (list || []).slice(0, 3).forEach((raw, i) => {
        const id = OTP.trackId(raw);
        if (!id || seen.has(id)) return;   // dupes would hit 23505
        seen.add(id);
        rows.push({ profile_id: user.id, slot: rows.length + 1, track: id });
      });
      const del = await c.from("featured_tracks").delete().eq("profile_id", user.id);
      if (del.error) throw del.error;
      if (!rows.length) return [];
      const { error } = await c.from("featured_tracks").insert(rows);
      if (error) throw error;
      return rows;
    },

    // Card art is a SEPARATE bucket from posts: posts allows 50MB and video,
    // card art must not. The canvas re-encode is not politeness, it is what
    // stops a 12MP phone photo being painted into a 169px grid tile on every
    // homepage load. 5GB/mo of free-tier egress does not survive that.
    async uploadCardArt(file) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      if (!/^image\//.test(file.type || "")) throw new Error("Card art has to be an image.");
      // TWO derivatives, size encoded in the FILENAME (-full / -card), following
      // the Spotify-cover-id precedent in index.html's sized(). Without the small
      // one, member art paints full-res into 169px roster tiles on every homepage
      // load, and 5GB/mo of free-tier egress does not survive that.
      const full = await OTP.fitCardArt(file, 930, 1240);
      const small = await OTP.fitCardArt(file, 570, 760);
      const base = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const up1 = await c.storage.from("cards").upload(`${base}-full.jpg`, full, {
        cacheControl: "3600", upsert: false, contentType: "image/jpeg",
      });
      if (up1.error) throw up1.error;
      const up2 = await c.storage.from("cards").upload(`${base}-card.jpg`, small, {
        cacheControl: "3600", upsert: false, contentType: "image/jpeg",
      });
      if (up2.error) throw up2.error;
      // The -full URL is what gets STORED; sized() derives -card from it.
      return c.storage.from("cards").getPublicUrl(`${base}-full.jpg`).data.publicUrl;
    },

    // Portrait 3:4, long edge 1240, JPEG. Card art that is not portrait crops
    // badly in every frame, so this cover-crops rather than letterboxing.
    fitCardArt(file, W = 930, H = 1240) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement("canvas");
          cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d");
          const s = Math.max(W / img.width, H / img.height);
          const w = img.width * s, h = img.height * s;
          // Bias upward: a portrait's subject sits above centre, and a straight
          // centre crop takes the top of the head off.
          ctx.drawImage(img, (W - w) / 2, (H - h) * 0.26, w, h);
          cv.toBlob(b => b ? resolve(b) : reject(new Error("Could not read that image.")),
                    "image/jpeg", 0.88);
          URL.revokeObjectURL(img.src);
        };
        img.onerror = () => reject(new Error("Could not read that image."));
        img.src = URL.createObjectURL(file);
      });
    },

    async myPosts(limit = 30) {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("posts")
        .select("id, text, image_url, image_alt, pinned, published, created_at, edited_at")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) { console.warn("your posts unavailable:", error.message); return []; }
      return data || [];
    },

    /* ---- the public timeline ---- */
    async feed(limit = FEED_CAP) {
      const c = sb(); if (!c) return [];
      // The ORDER BY is restated here on purpose. A view's own ORDER BY is not
      // guaranteed to survive a LIMIT, and with 8 slots "which 8" has to be
      // decided rather than hoped for.
      const { data, error } = await c.from("feed").select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) { console.warn("feed unavailable:", error.message); return []; }
      return (data || []).map(r => ({
        id: r.id,                       // carried so reactions key on the post, not its slot
        author: r.card_slug || "",
        author_name: r.display_name,
        text: r.text,
        image: r.image_url || "",
        image_alt: r.image_alt || "",
        pinned: !!r.pinned,
        date: r.created_at,
        edited: r.edited_at || null,
        accent: r.accent || null,
        live: true,
      }));
    },

    /* ---- the desk: his side ---- */
    async deskProfiles() {
      const c = sb(); if (!c) return [];
      const rpc = await c.rpc("desk_profiles");
      if (!rpc.error) return rpc.data || [];
      // pre-002 fallback
      const { data } = await c.from("profiles")
        .select("id, display_name, card_slug, approved, is_admin, created_at")
        .order("created_at", { ascending: false });
      return data || [];
    },

    async pending() { return (await OTP.deskProfiles()).filter(p => !p.approved); },
    async members() { return (await OTP.deskProfiles()).filter(p => p.approved); },

    async setApproved(id, approved) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("profiles").update({ approved }).eq("id", id);
      if (error) throw error;
    },

    async setCard(id, slug) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.rpc("admin_set_card", { p_id: id, p_slug: slug || null });
      if (error) throw error;
      return data;
    },

    // The desk's copy of saveMyWords. Same two columns, someone else's row, and
    // the "admin updates profiles" policy is what allows it. A member calling
    // this against another id gets zero rows back from RLS, not a silent write.
    async setMemberWords(id, { tagline, bio }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (tagline !== undefined) patch.tagline = String(tagline || "").trim() || null;
      if (bio !== undefined) patch.bio = String(bio || "").trim() || null;
      const { data, error } = await c.from("profiles").update(patch).eq("id", id).select("id");
      if (error) {
        if (error.code === "23514")
          throw new Error("Too long. A tagline is one line up to 80, a bio is up to 600.");
        throw error;
      }
      if (!data || !data.length) throw new Error("The database refused that. Not yours to edit.");
    },

    async retireMember(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.rpc("admin_retire_member", { p_author: id });
      if (error) throw error;
      return data;               // pull_batch uuid, hand it to restoreBatch to undo
    },

    async restoreBatch(batch) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.rpc("admin_restore_batch", { p_batch: batch });
      if (error) throw error;
      return data;
    },

    async allPosts(limit = 40) {
      const c = sb(); if (!c) return [];
      const dp = await c.from("desk_posts").select("*")
        .order("created_at", { ascending: false }).limit(limit);
      if (!dp.error) return dp.data || [];
      // pre-002 fallback
      const { data } = await c.from("posts")
        .select("id, text, image_url, image_alt, pinned, created_at, published, author_id, profiles(display_name)")
        .order("created_at", { ascending: false }).limit(limit);
      return data || [];
    },

    async setPublished(id, published) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("posts").update({ published }).eq("id", id);
      if (error) throw error;
    },

    async pullPost(id) { return OTP.setPublished(id, false); },

    async setPinned(id, pinned) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.rpc("admin_set_pinned", { p_id: id, p_on: !!pinned });
      if (error) throw error;
    },

    /* ---- housekeeping ---- */
    async orphanImages() {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("orphan_images").select("*")
        .eq("cleared", false).order("created_at", { ascending: false });
      if (error) { console.warn("orphan queue unavailable:", error.message); return []; }
      return data || [];
    },

    // The database queues a photo when its post goes away. The file itself is
    // removed here, through the Storage API, because deleting the metadata row
    // in SQL hides the file without ever reclaiming the space.
    async drainOrphans() {
      const c = sb(); if (!c) return { cleared: 0, stuck: 0 };
      const rows = await OTP.orphanImages();
      let cleared = 0, stuck = 0;
      for (const r of rows) {
        try {
          const { error } = await c.storage.from("posts").remove([r.object_name]);
          if (error) throw error;
          await c.from("orphan_images").update({ cleared: true, reason: "removed by the desk" })
            .eq("object_name", r.object_name);
          cleared++;
        } catch (e) {
          await c.from("orphan_images").update({ reason: e.message || "could not remove" })
            .eq("object_name", r.object_name);
          stuck++;
        }
      }
      return { cleared, stuck };
    },
  };

  w.OTP = OTP;
})(window);
