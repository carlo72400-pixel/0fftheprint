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

    async signUp(email, password, displayName, cardSlug) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.auth.signUp({
        email, password,
        options: { data: { display_name: displayName, card_slug: cardSlug } },
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
      const blob = await OTP.fitCardArt(file);
      const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await c.storage.from("cards").upload(name, blob, {
        cacheControl: "3600", upsert: false, contentType: "image/jpeg",
      });
      if (error) throw error;
      return c.storage.from("cards").getPublicUrl(name).data.publicUrl;
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
