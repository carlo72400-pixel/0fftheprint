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
  // 033: a casual member's photo lives in the small `take` bucket, a card
  // holder's media in `posts`. Same key shape in both, so say which bucket.
  // 037 / 030: pack photos (`packs`) and Crypt page pictures (`spaces`) have the
  // same <uid>/<file> keys and their own delete policies (own folder, or the
  // desk), so deleteImage can take those back too. Nothing here widens who may
  // delete: storage refuses a key that is not the caller's.
  // 044: card art (`cards`) too. Its own folder for a member, any folder for the
  // desk ("admin deletes any card art").
  const FILE_BUCKETS = ["posts", "take", "packs", "spaces", "cards"];
  const objectRef = url => {
    const m = /\/storage\/v1\/object\/public\/(posts|take|packs|spaces|cards)\/([^?#]+)/.exec(String(url || ""));
    return m ? { bucket: m[1], name: m[2] } : null;
  };

  // ---- Wave 2 shared bits ----------------------------------------------------
  // The database's own sentence, as an Error, with its code kept for callers that
  // branch on it. A raise in SQL is already written for a person to read.
  // Postgres's own "permission denied for function x" is not: it is what a door
  // that anon cannot run says to a page whose login ended (another tab logged
  // out, the session ran out), so it reads as the login it is missing.
  const fail = e => {
    const msg = String((e && e.message) || "");
    if (e && e.code === "42501" && /^permission denied for function/i.test(msg)) {
      const x = new Error("Log in first."); x.code = e.code; return x;
    }
    const x = new Error(msg || "That did not go through. Try again.");
    if (e && e.code) x.code = e.code;
    return x;
  };
  // A note somebody typed: no em dashes, trimmed, and a real NULL when empty.
  const noteOf = s => NO_DASH(s).trim() || null;
  // em and en dash, built from code points so no escape sits in this file
  const DASHES = new RegExp("[" + String.fromCharCode(8212, 8211) + "]", "g");
  const slugify = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  // ⛔ A card's slug is not always slugify(name): The Ink holds `theink`, WUN MOR
  // holds `wunmor`. Letters and digits only is the second key every page uses.
  const tight = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const CARD_SLUG_OK = /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/;
  const NIGHT_SLUG_OK = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$/;
  const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // The page's ONE link list (021). Host hardcoded, handle a bare word, the same
  // base cardback.js builds a c/ page's link row from.
  const LINK_BASE = {
    instagram:  ["Instagram",  h => "https://instagram.com/" + encodeURIComponent(h)],
    tiktok:     ["TikTok",     h => "https://www.tiktok.com/@" + encodeURIComponent(h)],
    youtube:    ["YouTube",    h => "https://www.youtube.com/@" + encodeURIComponent(h)],
    x:          ["X",          h => "https://x.com/" + encodeURIComponent(h)],
    twitch:     ["Twitch",     h => "https://twitch.tv/" + encodeURIComponent(h)],
    threads:    ["Threads",    h => "https://www.threads.net/@" + encodeURIComponent(h)],
    spotify:    ["Spotify",    h => "https://open.spotify.com/artist/" + encodeURIComponent(h)],
    soundcloud: ["SoundCloud", h => "https://soundcloud.com/" + encodeURIComponent(h)],
    bandcamp:   ["Bandcamp",   h => "https://" + encodeURIComponent(h) + ".bandcamp.com/"],
  };
  const linkOf = (p, h) => {
    const base = LINK_BASE[String(p || "").toLowerCase()];
    if (!base || !/^[A-Za-z0-9._-]{1,30}$/.test(String(h || ""))) return null;
    return { link: base[1](h), platform: base[0] };
  };

  // Where the site lives, read off this script's own address, so a check can ask
  // for a page by path from any depth (/word/new/, /card/, the homepage). Null in
  // anything that is not a browser page, and every caller treats null as "skip".
  const ROOT = (() => {
    try {
      const s = document.currentScript && document.currentScript.src;
      const m = s && /^(.*\/)assets\/js\/desk\.js(?:[?#].*)?$/.exec(s);
      return m ? m[1] : null;
    } catch (e) { return null; }
  })();

  // ---- one shrink for a still photo ----------------------------------------
  // The same decode as uploadTakePhoto: from-image honours EXIF on Safari 15,
  // and a browser that rejects the option lands in the <img> path, which always
  // has. Never upscales. Returns the JPEG and the size it came out at.
  const STILL_BAD = "That photo would not open. Try a JPG or a PNG.";
  async function openStill(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      return await new Promise((ok, no) => {
        const im = new Image();
        const u = URL.createObjectURL(file);
        im.onload = () => { URL.revokeObjectURL(u); ok(im); };
        im.onerror = () => { URL.revokeObjectURL(u); no(new Error(STILL_BAD)); };
        im.src = u;
      });
    }
  }
  async function shrinkStill(file, edge, q) {
    const src = await openStill(file);
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    if (!w0 || !h0) throw new Error(STILL_BAD);
    const k = Math.min(1, edge / Math.max(w0, h0));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
    const g = cv.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(src, 0, 0, cv.width, cv.height);
    try { if (src.close) src.close(); } catch (e) {}
    const blob = await new Promise((ok, no) => cv.toBlob(
      b => b ? ok(b) : no(new Error(STILL_BAD)), "image/jpeg", q));
    return { blob, w: cv.width, h: cv.height, scaled: k < 1 };
  }
  // A card holder's timeline photo used to go up as the camera wrote it: a 3.7MB
  // JPEG sat on the homepage for every visitor, against 5GB/mo of egress. Camera
  // formats only (JPEG, HEIC). PNG, WebP and AVIF can carry transparency that a
  // JPEG would paint black, and GIFs move, so those go up untouched.
  const POST_EDGE = 2048, POST_Q = 0.88, POST_KEEP = 1.5 * 1024 * 1024;

  // ---- member stories: the lengths migration 010 holds them to ------------
  // char_length counts characters and JS .length counts UTF-16 units, so an
  // emoji is one to the database and two here. Count the way the database does.
  const chars = s => Array.from(String(s == null ? "" : s)).length;
  const STORY_SAYS = {
    title_short: "Give it a headline, 3 characters or more.",
    title_long:  "Headlines stop at 80 characters. Trim it.",
    dek_short:   "Give it a one-line dek.",
    dek_long:    "The dek is one line, 200 characters at most.",
    body_short:  "The story needs at least a couple of sentences.",
    body_long:   "20,000 characters is the ceiling. Trim it.",
  };
  // Checks only the fields it is handed, as they will be SENT (after NO_DASH and trim).
  const storyFits = ({ title, dek, body }) => {
    if (title !== undefined) {
      const n = chars(title);
      if (n < 3) throw new Error(STORY_SAYS.title_short);
      if (n > 80) throw new Error(STORY_SAYS.title_long);
    }
    if (dek !== undefined) {
      const n = chars(dek);
      if (n < 3) throw new Error(STORY_SAYS.dek_short);
      if (n > 200) throw new Error(STORY_SAYS.dek_long);
    }
    if (body !== undefined) {
      const n = chars(body);
      if (n < 30) throw new Error(STORY_SAYS.body_short);
      if (n > 20000) throw new Error(STORY_SAYS.body_long);
    }
  };
  // A 23514 that gets past storyFits still reads as a sentence, not a constraint name.
  const storyWhy = error => {
    const m = String((error && error.message) || "");
    if (/member_stories_title_check/.test(m)) return new Error("Headlines run 3 to 80 characters.");
    if (/member_stories_dek_check/.test(m)) return new Error("The dek runs 3 to 200 characters.");
    if (/member_stories_body_md_check/.test(m)) return new Error("The story runs 30 to 20,000 characters.");
    if (/member_stories_cover_ours/.test(m)) return new Error("That cover photo is not in your folder.");
    // 045: the cover has to be one of ours (a photo in the posts bucket), never a link
    if (/member_stories_cover_shape/.test(m)) return new Error("Covers have to be a photo uploaded here.");
    if (/member_stories_kicker_ok/.test(m)) return new Error("A kicker is 2 to 24 capitals, numbers, spaces and & ' . ! ? -, like THE NIGHT.");
    if (/member_stories_shelf_ok/.test(m)) return new Error("That shelf is not one of the five.");
    if (/member_stories_slug_check/.test(m)) return new Error("That title needs more to it.");
    return new Error("Something in that story is too long or too short.");
  };

  // ---- THE EXCHANGE (022) ---------------------------------------------------
  // want_house / house_status / event_slug are what turn the calendar from a
  // listing into a trade. A database that has not run 022 answers 42703 to the
  // WHOLE select rather than leaving three fields empty, so every calendar read
  // asks wide and drops back to the 020 shape. Losing the exchange marks is a
  // fair failure; losing the run of dates is not.
  const CAL_EXCH = "want_house,house_status,event_slug";
  // ---- WHOSE NIGHT IT IS (025) ----------------------------------------------
  // `by` is who typed the date in. `credit` is whose night it is, and they are
  // different questions: every row on this calendar was entered by the desk.
  const CAL_CREDIT = "credit,credit_name";

  // ⛔ THREE SHAPES NOW, NOT TWO, AND THE BUILDER IS TOLD WHICH ONE IT IS ON.
  // 025 (credit) degrades to 022 (the exchange) degrades to 020 (a bare run of
  // dates). The tier argument matters because a reader does not just SELECT the
  // new column, it FILTERS on it, and PostgREST answers 42703 to an unknown
  // column in a filter exactly as it does in a select. A fallback that kept
  // sending the credit filter would fail for the same reason as the attempt it
  // was falling back from, and the whole calendar would go dark on a database
  // that had not run 025 yet.
  const calTry = async (build, ...shapes) => {
    let r;
    for (let tier = 0; tier < shapes.length; tier++) {
      r = await build(shapes[tier], tier);
      if (!(r.error && r.error.code === "42703")) break;
      if (tier < shapes.length - 1)
        console.warn("calendar: dropping back a shape,", r.error.message);
    }
    if (r.error) throw r.error;
    return r.data || [];
  };

  // ⛔ THE SLUG GOES INTO A RAW PostgREST FILTER, SO IT GETS CHECKED FIRST.
  // .eq() is encoded by the client library; .or() is not, it is filter grammar.
  // The slug reaching these readers comes off the URL (cardback.js readSlug
  // takes it from the path or from ?s=), so a comma or a paren in it would
  // rewrite the query. Shape it the way 002 shapes card_slug, or do not use the
  // or() branch at all.
  const CAL_SLUG_OK = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

  // ---- ONE me() PER PAGE LOAD ------------------------------------------------
  // The homepage asks five times (door, composer, edit, people, music) and every
  // ask was a getUser round trip plus my_profile, one after the other on a phone.
  // The first ask is shared. It is forgotten on sign in, sign up, sign out, a
  // changed user, and after any write to the caller's own profile, so nothing
  // reads a stale answer after it changed something. A failed or doubtful answer
  // is never kept.
  // meUid is undefined until an answer is kept (null then means a kept "nobody
  // signed in"). meSaw is the user a SIGNED_IN named while the first ask was
  // still out: supabase-js fires one for the saved login as the client starts,
  // which is the same person, not a new one. MIXED means two different people.
  const MIXED = {};
  let meP = null, meUid, meSaw;
  // THE RUN: upcoming() shares one calendar read per page (keyed by limit). It
  // goes wherever the me() answer goes, because the desk reads pulled dates a
  // stranger cannot, so a sign in or out must not hand back the other's list.
  const upMemo = new Map();
  const forgetMe = () => { meP = null; meUid = undefined; meSaw = undefined; upMemo.clear(); };

  let client = null;
  function sb() {
    if (!READY) return null;
    if (!client) {
      if (!w.supabase || !w.supabase.createClient) return null;
      client = w.supabase.createClient(CFG.url, CFG.anonKey);
      // Covers logins that go round OTP (a page calling sb().auth itself, a
      // password reset). Only resets a variable: the docs warn against calling
      // back into the client from inside this callback. TOKEN_REFRESHED and
      // INITIAL_SESSION change nobody, and a SIGNED_IN for the same person (a tab
      // coming back into focus, or the client starting on a saved login) keeps
      // the answer. One that lands while the first ask is still out is noted and
      // checked against that answer when it comes back.
      try {
        client.auth.onAuthStateChange((ev, session) => {
          const uid = session && session.user ? session.user.id : null;
          if (ev === "SIGNED_OUT" || ev === "USER_UPDATED") { forgetMe(); return; }
          if (ev !== "SIGNED_IN") return;
          if (meP && meUid === undefined) { meSaw = (meSaw === undefined || meSaw === uid) ? uid : MIXED; return; }
          if (meUid !== undefined && uid !== meUid) forgetMe();
        });
      } catch (e) {}
    }
    return client;
  }

  // ---- Wave 2 plumbing (used by the headed blocks inside OTP) ----------------
  // One RPC, the database's own sentence on a refusal.
  async function call(name, args) {
    const c = sb(); if (!c) throw new Error("Backend not configured yet.");
    const { data, error } = args ? await c.rpc(name, args) : await c.rpc(name);
    if (error) throw fail(error);
    return data;
  }

  // Is anybody signed in on this phone? The saved session, read locally, so a
  // stranger's page never sends a members-only call just to be told no.
  async function hasSession(c) {
    try {
      if (c.auth.getSession) {
        const { data } = await c.auth.getSession();
        return !!(data && data.session);
      }
      const { data } = await c.auth.getUser();
      return !!(data && data.user);
    } catch (e) { return false; }
  }

  // Files the database hands back after a desk clear or a removal. One remove per
  // file, in the bucket the database named (and only a bucket this site has).
  // Best effort: the row is already changed, so a failed unlink never throws
  // back at the desk; it leaves one file, same as the orphan queue does.
  // A card photo has a -card twin made from the same upload (uploadCardArt), so
  // the twin goes with it. Returns how many of the named files came off.
  async function dropFiles(files) {
    const c = sb(); if (!c || !Array.isArray(files)) return 0;
    let n = 0;
    for (const f of files) {
      if (!f || FILE_BUCKETS.indexOf(f.bucket) === -1) continue;
      const name = String(f.name || "");
      if (!name || name.charAt(0) === "/" || name.indexOf("..") !== -1) continue;
      try {
        const r = await c.storage.from(f.bucket).remove([name]);
        if (!(r && r.error)) n++;
      } catch (e) {}
      if (f.bucket === "cards" && /-full\.jpg$/.test(name)) {
        try { await c.storage.from("cards").remove([name.replace(/-full\.jpg$/, "-card.jpg")]); } catch (e) {}
      }
    }
    return n;
  }

  // A video row and then its cover. The cover is read FIRST: 014 had no orphan
  // trigger (002's is posts-only), and a bare row delete left the cover in the
  // 1GB posts bucket forever. The file goes only after a row came back, so a
  // refused delete never takes somebody's cover with it. Returns rows deleted.
  async function dropVideo(id) {
    const c = sb(); if (!c) throw new Error("Backend not configured yet.");
    let key = null;
    try {
      const { data } = await c.from("featured_videos")
        .select("cover_url").eq("id", id).maybeSingle();
      key = data ? objectName(data.cover_url) : null;   // the same parser posts use
    } catch (e) { /* the row still has to go */ }
    const { data, error } = await c.from("featured_videos").delete().eq("id", id).select("id");
    if (error) throw error;
    const n = (data || []).length;
    if (n && key) { try { await c.storage.from("posts").remove([key]); } catch (e) {} }
    return n;
  }

  async function dropDate(id) {
    const c = sb(); if (!c) throw new Error("Backend not configured yet.");
    const { data, error } = await c.from("calendar_dates").delete().eq("id", id).select("id");
    if (error) throw error;
    return (data || []).length;
  }

  // THE MEMBERS MANAGER: a desk_members row, with the names the pre-045 lists
  // carried (display_name, is_admin, approved, denied) for pages still on them.
  const deskRow = p => Object.assign({}, p, {
    display_name: p.name,
    is_admin: p.role === "desk",
    approved: p.role === "card" || p.role === "desk",
    denied: !!p.said_no,
  });

  // ONE PROFILE: people() answers once per page load.
  let peopleP = null;
  const PEOPLE_WAIT_MS = 3000;

  // YOUR ACCOUNT: prove it is still them before an email, password or close.
  // A fresh sign in with the password they typed, for the email on the login.
  // A wrong password is a sentence, never GoTrue's wording. Both ends forget the
  // me() answer, because a sign in is a new session even for the same person.
  async function reauth(c, pw) {
    const { data, error } = await c.auth.getUser();
    const user = data && data.user;
    if (error || !user) throw new Error("Log in first.");
    if (!user.email) throw new Error("Log out and back in, then try again.");
    if (!pw) throw new Error("Put your password in first.");
    forgetMe();
    try {
      const r = await c.auth.signInWithPassword({ email: user.email, password: String(pw) });
      if (r && r.error) {
        const e = r.error;
        if (e.code === "invalid_credentials" || /invalid login/i.test(e.message || ""))
          throw new Error("That's not your password.");
        throw fail(e);
      }
    } finally {
      forgetMe();
    }
  }

  const OTP = {
    configured: READY,
    sb,
    FEED_CAP,

    // { user, profile } for the session, or null when nobody is signed in.
    // `failed: true` rides along when my_profile would not answer twice running:
    // the login is real but the profile is unknown, which is not the same thing
    // as a login with no profile. Every caller gets its own copy of the profile.
    async me() {
      if (!meP) {
        const p = meP = (async () => {
          // No client yet (the library has not loaded) is not an answer to keep.
          const c = sb(); if (!c) return { r: null, keep: false };
          const { data, error } = await c.auth.getUser();
          const user = data && data.user;
          // No user AND an error is a network hiccup as often as a signed-out
          // visitor, so that null is handed back but not kept.
          if (!user) return { r: null, keep: !error };

          // is_admin stopped being a readable column with migration 002, so the
          // profile comes back through an RPC that only ever returns the caller's
          // own row. Nobody gets to enumerate who runs the desk.
          // ⛔ The pre-002 fallback that used to sit here selected is_admin
          // straight off profiles, which no API role may read, so a one-off
          // my_profile failure turned a card holder (or the desk) into a plain
          // login for that page load. One retry instead.
          let rpc = await c.rpc("my_profile");
          if (rpc.error) {
            await new Promise(ok => setTimeout(ok, 600));
            rpc = await c.rpc("my_profile");
          }
          if (!rpc.error) return { r: { user, profile: (rpc.data && rpc.data[0]) || null }, keep: true };
          console.warn("me: my_profile did not answer,", rpc.error.message);
          return { r: { user, profile: null, failed: true }, keep: false };
        })();
        p.then(x => {
          if (meP !== p) return;
          const uid = x.r && x.r.user ? x.r.user.id : null;
          // a SIGNED_IN for somebody else came in while this was out: do not keep it
          if (!x.keep || (meSaw !== undefined && meSaw !== uid)) { meP = null; meSaw = undefined; return; }
          meUid = uid; meSaw = undefined;
        }, () => { if (meP === p) { meP = null; meSaw = undefined; } });
      }
      const { r } = await meP;
      return r && Object.assign({}, r, { profile: r.profile ? Object.assign({}, r.profile) : r.profile });
    },

    // `via` is "wall" when the signup comes from The Wall's join form (a code member,
    // not a card applicant). wall_redeem() reads it: anyone who signed up at /join/
    // and LATER redeems the code keeps their place in the desk's card queue (034).
    async signUp(email, password, displayName, cardSlug, instagram, via) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const ig = String(instagram || "").trim().replace(/^@/, "").toLowerCase();
      const data = {
        display_name: displayName,
        card_slug: cardSlug,
        // handle only; the trigger sanitizes again server side
        instagram: /^[a-z0-9._]{1,30}$/.test(ig) ? ig : "",
      };
      if (via === "wall") data.via = "wall";
      forgetMe();
      const { error } = await c.auth.signUp({
        email, password,
        options: { data },
      });
      forgetMe();
      if (error) throw error;
    },

    async signIn(email, password) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      forgetMe();
      const { error } = await c.auth.signInWithPassword({ email, password });
      forgetMe();
      if (error) throw error;
    },

    // ⛔ Every page on the site shares one localStorage, so a sign-out on /my/ has
    // to take the last person's door with it. otp_door is the homepage nav's
    // remembered state (it repainted "Desk" for the next visitor), and wall-k is
    // the Crypt's cached key (the Crypt opened on it before checking the login).
    // The going marks (wall-going and its -synced and -off notes), wall-mine
    // (your own events) and wall-watch (the watchlist) are left alone on purpose:
    // a night more than 120 days out and a mark made offline live on this phone
    // only, so clearing them would delete them, and clearing only the notes would
    // bring back marks taken off. Keeping them apart per person is the Crypt's job.
    // Wave 2 adds two that belong to the login, not the phone: wall-fix (the
    // desk's Crypt flyer fixes, read through the members-only table) and otp-kept
    // (the cards a member kept, cached with their uid for pages without desk.js).
    async signOut() {
      const c = sb(); if (!c) return;
      forgetMe();
      try {
        await c.auth.signOut();
      } finally {
        forgetMe();
        ["otp_door", "wall-k", "wall-fix", "otp-kept"].forEach(k => {
          try { w.localStorage.removeItem(k); } catch (e) {}
        });
      }
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

      // A camera photo goes up at most POST_EDGE on the long edge (see POST_EDGE).
      // A JPEG that is already small stays byte for byte what they picked. A HEIC
      // that opens comes out a JPEG, which every browser can show. Anything that
      // will not open here (a HEIC on a desktop Chrome, say) goes up as it was.
      let body = file;
      if (ext === "jpg" || ext === "heic" || ext === "heif") {
        try {
          const s = await shrinkStill(file, POST_EDGE, POST_Q);
          if (ext !== "jpg" || ((s.scaled || file.size > POST_KEEP) && s.blob.size < file.size)) {
            body = s.blob; ext = "jpg";
          }
        } catch (e) { body = file; }
      }

      // The key MUST start with <uid>/ or the storage policy refuses it. That is
      // what stops one member from touching another member's photos.
      const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await c.storage.from("posts").upload(name, body, {
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
      const ref = objectRef(url);
      if (!ref) return;
      const { error } = await c.storage.from(ref.bucket).remove([ref.name]);
      if (error) throw error;
    },

    // 033: "everyone can post on the timeline". A casual member's photo is shrunk
    // on the phone (1600px JPEG) and goes to the `take` bucket: 4MB a file, photos
    // only, twelve a day, all enforced by the bucket and its policy, not by this.
    // Card holders keep uploadImage() above (GIFs, video, 50MB).
    // 045 (THE ROLL): a Roll photo is members only, so it is cached for an hour
    // like a card holder's post, not a year: a photo taken down must not live on
    // in every phone's cache. opts.roll says which.
    async uploadTakePhoto(file, opts = {}) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      if (/^video\//.test(file.type || "") || /\.(mp4|mov|webm|m4v)$/i.test(file.name || "")) {
        throw new Error("Photos only here. Video is a card holder thing.");
      }
      let src;
      // from-image: Safari 15 ignored EXIF here without it and a portrait phone
      // photo went up sideways. A browser that rejects the option lands in the
      // <img> path below, which has always honoured orientation.
      try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch (e) {
        src = await new Promise((ok, no) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => no(new Error("That photo would not open. Try a JPG or a PNG."));
          im.src = URL.createObjectURL(file);
        });
      }
      const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
      if (!w0 || !h0) throw new Error("That photo would not open. Try a JPG or a PNG.");
      const k = Math.min(1, 1600 / Math.max(w0, h0));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
      const g = cv.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(src, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok, no) => cv.toBlob(
        b => b ? ok(b) : no(new Error("That photo would not open. Try a JPG or a PNG.")), "image/jpeg", 0.86));
      const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await c.storage.from("take").upload(name, blob, {
        cacheControl: (opts && opts.roll) ? "3600" : "31536000", upsert: false, contentType: "image/jpeg",
      });
      if (error) {
        // The policy refuses for more than one reason (the daily twelve, a ban, a
        // session that lapsed). Only say "twelve" when the count says so.
        let n = null;
        if (/row-level security|policy|unauthorized/i.test(error.message || "")) {
          try { const r = await c.rpc("uploads_today", { p_bucket: "take" }); if (!r.error) n = r.data; } catch (e) {}
        }
        throw new Error(n != null && n >= 12
          ? "That is twelve photos today. Try again tomorrow."
          : "That photo did not upload. Try again, and if it keeps happening tell the desk.");
      }
      return c.storage.from("take").getPublicUrl(name).data.publicUrl;
    },

    // 037 (10/11): a photo for a member's own pack. Same shrink as a take photo, the `packs`
    // bucket, the member's own folder, forty a day (the policy counts). Returns the storage KEY
    // (what pack_save wants), not the public url: packs.js builds the url when it draws.
    async uploadPackPhoto(file) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      if (!/^image\//.test(file.type || "") || /\.(gif)$/i.test(file.name || "")) throw new Error("Photos only in a pack: JPG, PNG or WebP.");
      let src;
      try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch (e) {
        src = await new Promise((ok, no) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => no(new Error("That photo would not open. Try a JPG or a PNG."));
          im.src = URL.createObjectURL(file);
        });
      }
      const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
      if (!w0 || !h0) throw new Error("That photo would not open. Try a JPG or a PNG.");
      const k = Math.min(1, 2000 / Math.max(w0, h0));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
      const g = cv.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(src, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok, no) => cv.toBlob(
        b => b ? ok(b) : no(new Error("That photo would not open. Try a JPG or a PNG.")), "image/jpeg", 0.88));
      const name = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await c.storage.from("packs").upload(name, blob, {
        cacheControl: "31536000", upsert: false, contentType: "image/jpeg",
      });
      if (error) {
        let n = null;
        if (/row-level security|policy|unauthorized/i.test(error.message || "")) {
          try { const r = await c.rpc("uploads_today", { p_bucket: "packs" }); if (!r.error) n = r.data; } catch (e) {}
        }
        throw new Error(n != null && n >= 40
          ? "That is forty pack photos today. Try again tomorrow."
          : "That photo did not upload. Try again, and if it keeps happening tell the desk.");
      }
      return { key: name, url: c.storage.from("packs").getPublicUrl(name).data.publicUrl, w: cv.width, h: cv.height };
    },
    packPhotoUrl(key) {
      const c = sb(); if (!c || !key) return "";
      return c.storage.from("packs").getPublicUrl(key).data.publicUrl;
    },

    // May this session post to the timeline? Card holders, the desk, and anyone on
    // The Wall who is not banned (033). False on a database that has not run 033.
    async canTake() {
      const c = sb(); if (!c) return false;
      try { const r = await c.rpc("take_can_post"); return !r.error && r.data === true; }
      catch (e) { return false; }
    },

    /* ---- posting: your own stuff, no approval needed ---- */
    // ⛔ 045: members_only is ALWAYS sent, false from Home's box and true from the
    // Roll. The column has no default and the database fails closed: a post that
    // arrives without the flag and with a member's photo goes behind the door.
    async post({ text, imageUrl, imageAlt, membersOnly }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const { data, error } = await c.from("posts").insert({
        author_id: user.id,
        text: NO_DASH(text),
        image_url: imageUrl || null,
        image_alt: imageAlt || null,
        members_only: !!membersOnly,
      }).select("id, text, image_url, image_alt, published, created_at, edited_at, members_only").single();
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
      const { data, error } = await c.from("posts").delete().eq("id", id).select("id, image_url");
      if (error) throw error;
      if (!data || !data.length) {
        throw new Error("That one is not yours to delete any more. The desk has it.");
      }
      // The photo goes with the post, from every place a post can be deleted (Home,
      // the Roll, the pencil, /compose/, the desk), not only Home's quick Delete.
      // Asked the database's own question first: another post by the same author
      // can still be using the file, and the desk's storage policy (unlike a
      // member's) would let that file go anyway. Best effort: the row is already
      // gone, and the orphan queue the trigger filled is still the backstop.
      const ref = objectRef(data[0].image_url);
      if (ref && (ref.bucket === "posts" || ref.bucket === "take")) {
        try {
          const u = await c.rpc("post_image_in_use", { p_name: ref.name });
          if (!u.error && u.data === false) await c.storage.from(ref.bucket).remove([ref.name]);
        } catch (e) {}
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
      forgetMe();
      return v;
    },

    // ---- THE CARD BUILDER (migration 007) --------------------------------
    // Frames a member may pick without a grant. Kept in step with the CHECK in
    // migration-007: `card_frame in (...) or card_frame = frame_grant`. This
    // list is a CONVENIENCE for the picker, never the gate. The gate is the
    // database, so a crafted request is refused whatever this array says.
    OPEN_FRAMES: ["common", "uncommon", "rare", "rare-holo"],

    // The card's ONE link (profiles.link_platform), kept in step with the CHECK
    // profiles_link_platform_known in migration-007. ⛔ Not LINK_PLATFORMS: that
    // name is the page's links list further down (021, nine platforms), and two
    // keys with one name in this object meant the later one won, so the card
    // builder offered x, twitch and threads, which this column refuses.
    CARD_LINK_PLATFORMS: ["instagram", "tiktok", "youtube", "spotify", "soundcloud", "bandcamp"],

    // Pull the bare 22-char id out of whatever a member pasted, plus a REASON
    // when it fails. Mirrors parseSpotifyId() in index.html. Storing the ID and
    // never a URL is what makes a scheme unrepresentable in the column. The
    // loose /track\/<22>/ pattern covers open.spotify.com, spotify: URIs and the
    // /intl-xx/ prefix a phone in another locale hands you.
    // ⛔ The reason exists because every surface that took a song used to save
    // a bare null and then say "Saved." A link that did not parse wiped the
    // song and reported success, which is the worst possible pairing.
    readTrack(s) {
      const v = String(s == null ? "" : s).trim();
      if (!v) return { id: null, empty: true };
      const m = v.match(/(?:track\/|spotify:track:)([A-Za-z0-9]{22})/) ||
                v.match(/^([A-Za-z0-9]{22})$/);
      if (m) return { id: m[1] };
      if (/spotify\.link\//i.test(v)) return { id: null, why:
        "That is a Spotify short link. Open it once and copy the address it lands on." };
      const kind = (v.match(/spotify\.com\/(?:intl-[a-z-]+\/)?(album|playlist|artist|episode|show)\//i) || [])[1];
      if (kind) return { id: null, why:
        "That is " + (/^[aeiou]/i.test(kind) ? "an " : "a ") + kind.toLowerCase() +
        " link. Open the song itself and copy that one." };
      if (/music\.apple|soundcloud|youtu|bandcamp|tidal|deezer/i.test(v)) return { id: null, why:
        "Cards play Spotify only. Find the same song on Spotify and copy that link." };
      if (/^https?:/i.test(v)) return { id: null, why:
        "That link has no Spotify track in it." };
      return { id: null, why:
        "Paste a Spotify song link, or the 22 character track id on its own." };
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
      if ("theme_song" in fields) {
        const t = OTP.readTrack(fields.theme_song);
        // Refuse rather than wipe. Clearing the box on purpose still clears it.
        if (!t.id && !t.empty) throw new Error(t.why);
        patch.theme_track = t.id;
      }
      if ("link_platform" in fields) patch.link_platform = fields.link_platform || null;
      if ("link_handle" in fields) {
        const h = String(fields.link_handle || "").trim().replace(/^@/, "");
        patch.link_handle = /^[A-Za-z0-9._-]{1,30}$/.test(h) ? h : null;
      }
      const { error } = await c.from("profiles").update(patch).eq("id", user.id);
      // The database is the gate, so surface WHY rather than a raw code. Every
      // CHECK on these columns answers 23514, so the constraint's name says which
      // one it was. Only the frame's own CHECK reads as the frame.
      if (error) {
        const m = String(error.message || "");
        if (error.code === "22P02") throw new Error("That frame does not exist.");
        if (error.code === "23514") {
          if (/card_photo_ours/.test(m)) throw new Error("That photo is not in your folder.");
          if (/link_platform_known/.test(m)) throw new Error("A card links to Instagram, TikTok, YouTube, Spotify, SoundCloud or Bandcamp.");
          if (/link_handle_shape/.test(m)) throw new Error("A handle can only be letters, numbers, dots, dashes and underscores, up to 30.");
          if (/theme_track_id/.test(m)) throw new Error("That song link did not read. Paste the Spotify song link again.");
          if (/theme_start_sane/.test(m)) throw new Error("The start time has to be within the first hour of the song.");
          throw new Error("That frame is not yours to pick yet.");
        }
        if (error.code === "42501") throw new Error("That photo is not in your folder.");
        throw error;
      }
      forgetMe();
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

    // 045: a member takes their own line down, published or not.
    async withdrawEntry(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("word_entries").delete()
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("That one is not yours to take down.");
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

    // The desk's publish and delete setters hand back how many rows they touched,
    // so deskHide / deskDelete can say "already gone" instead of "done".
    async setEntryPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("word_entries")
        .update({ published: !!on }).eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
    },

    async deleteEntry(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("word_entries").delete().eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
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
    // ---- STORIES (045) ----
    // Members fix and take down their own (calls 8, 12): an edit while the
    // story is not baked yet is theirs, with the old words kept as a revision
    // the desk can read (storyRevisions). Once bake.py folds it into the
    // catalog it is the desk's. The desk files HOUSE stories through the same
    // insert (house, kicker, shelf), and the database publishes an author's own
    // story itself, so WRITE ONE never lands unpublished.
    // Every read below carries edited_at, house, kicker and shelf.
    SHELVES: ["nights", "guides", "dates", "culture", "interviews"],

    slugifyTitle(t) {
      return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "").slice(0, 60);
    },

    async submitStory({ title, dek, body, coverUrl, house, kicker, shelf }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const slug = OTP.slugifyTitle(title);
      if (slug.length < 3) throw new Error("That title needs more to it.");
      if (/^!\[/m.test(body || "")) throw new Error("Images inside the story are not a thing yet. One cover photo is.");
      const row = {
        author_id: user.id, slug,
        title: NO_DASH(title).trim(),
        dek: NO_DASH(dek).trim(),
        body_md: NO_DASH(body),
        cover_url: coverUrl || null,
      };
      // A house story: the desk's own, filed under a kicker and a shelf. The
      // guard refuses `house` from anybody who is not the desk, and drops the
      // kicker and shelf from a member's row whatever this sends.
      if (house) {
        row.house = true;
        row.kicker = String(kicker == null ? "" : kicker).replace(DASHES, "-").trim().toUpperCase().slice(0, 24) || null;
        row.shelf = OTP.SHELVES.indexOf(shelf) !== -1 ? shelf : null;
      }
      storyFits({ title: row.title, dek: row.dek, body: row.body_md });
      // ⛔ A HOUSE story is a folder (word/<slug>/), not a row, so the unique slug
      // on member_stories cannot see it, and neither can the composer's own
      // word/new/ or the reader's word/live/. A member story under one of those
      // slugs never bakes (bake.py finds the folder and skips it). Ask for the
      // folder first. Fails open: no answer is not a reason to refuse a story.
      if (ROOT) {
        let taken = false;
        try {
          const r = await fetch(ROOT + "word/" + slug + "/", { method: "HEAD", cache: "no-store" });
          taken = !!(r && r.ok);
        } catch (e) {}
        if (taken) throw new Error("A story already runs under that title. Pick another.");
      }
      const { error } = await c.from("member_stories").insert(row);
      if (error) {
        if (error.code === "23505") {
          throw new Error(error.message.indexOf("one_pending") !== -1
            ? "You already have one on the desk. One at a time."
            : "A story already runs under that title. Pick another.");
        }
        if (error.code === "23514") throw storyWhy(error);
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
      storyFits({ title: patch.title, dek: patch.dek, body: patch.body_md });
      const { data, error } = await c.from("member_stories")
        .update(patch).eq("id", id).select("id");
      if (error) {
        if (error.code === "23514") throw storyWhy(error);
        // 55000 is the twenty-edits-an-hour ceiling, already a sentence
        throw fail(error);
      }
      // 045: the policy is "own story, not baked yet", so zero rows means bake.py
      // has folded it into the catalog.
      if (!data || !data.length) throw new Error("That one is in the catalog now. The desk fixes it from here.");
    },

    async withdrawStory(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("member_stories").delete()
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data || !data.length) throw new Error("That one is in the catalog now. The desk takes it down from here.");
    },

    async myStories() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("member_stories")
        .select("id,slug,title,dek,body_md,cover_url,published,baked,created_at,edited_at,house,kicker,shelf")
        .eq("author_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    // Published, unbaked member stories for the homepage overlay. Baked ones
    // are skipped because the committed desk.json floor carries them by then.
    // 045: house rows ride along (house, kicker, shelf), which is how a story the
    // desk files from the board reaches the Stories tab before the bake.
    async wordStories(limit = 24) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("word_stories")
        .select("slug,title,dek,cover_url,baked,created_at,display_name,card_slug,edited_at,house,kicker,shelf")
        .eq("baked", false)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data || [];
    },

    async wordStory(slug) {
      const c = sb(); if (!c) return null;
      const { data, error } = await c.from("word_stories")
        .select("slug,title,dek,body_md,cover_url,created_at,display_name,card_slug,edited_at,house,kicker,shelf")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data || null;
    },

    // The reader's fallback: RLS decides who sees an unpublished story
    // (its author, or the desk). Anon gets published rows only.
    async storyAnyRole(slug) {
      const c = sb(); if (!c) return null;
      const { data, error } = await c.from("member_stories")
        .select("slug,title,dek,body_md,cover_url,published,created_at,edited_at,house,kicker,shelf")
        .eq("slug", slug).maybeSingle();
      if (error) return null;
      return data || null;
    },

    async deskStories() {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("member_stories")
        .select("id,slug,title,dek,body_md,cover_url,published,baked,created_at,edited_at,house,kicker,shelf, profiles(display_name)")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },

    async setStoryPublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("member_stories")
        .update({ published: !!on }).eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
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
    // 045 (call 12): the cover too. undefined leaves it, null clears it, and a
    // URL sets it (the guard lets the desk pick a photo from its own folder).
    async updateStory(id, { title, dek, body, coverUrl }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (title !== undefined) patch.title = NO_DASH(title).trim();
      if (dek !== undefined) patch.dek = NO_DASH(dek).trim();
      if (body !== undefined) {
        if (/^!\[/m.test(body || "")) throw new Error("Images inside the story are not a thing yet. One cover photo is.");
        patch.body_md = NO_DASH(body);
      }
      if (coverUrl !== undefined) patch.cover_url = coverUrl || null;
      // Checked before the write, so a too-long headline is a sentence, not a
      // Postgres constraint name, and nothing reached the database.
      storyFits({ title: patch.title, dek: patch.dek, body: patch.body_md });
      const { data, error } = await c.from("member_stories")
        .update(patch).eq("id", id).select("id");
      if (error) {
        if (error.code === "23514") throw storyWhy(error);
        throw error;
      }
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
      const { data, error } = await c.from("member_stories").delete().eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
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
      const { data, error } = await c.from("featured_videos").update({ published: !!on }).eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
    },

    async setVideoFeatured(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { error } = await c.from("featured_videos").update({ featured: !!on }).eq("id", id);
      if (error) throw error;
    },

    // 045: a member takes down their own video, published or not ("author
    // withdraws own video"), so zero rows is the one answer that means no.
    async deleteVideo(id) {
      if (!(await dropVideo(id))) throw new Error("That one is not yours to take down.");
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
      const t = OTP.readTrack(url);
      if (!t.id) throw new Error(t.why || "That is not a Spotify track link.");
      const id = t.id;
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
      const t = OTP.readTrack(url);
      if (!t.id) throw new Error(t.why || "That is not a Spotify track link.");
      const id = t.id;
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
      // 045: their own pick comes down whether it is on rotation or not
      if (!data || !data.length) throw new Error("That one is not yours to take down.");
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
      const { data, error } = await c.from("rotation_tracks")
        .update({ published: !!on }).eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
    },

    async deleteTrack(id) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("rotation_tracks").delete().eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
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
                   "theme_song,theme_start,link_platform,link_handle,links,featured";
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

    // ---- THE CALENDAR (migration 020) -----------------------------------
    // 0TP-006 ended with "if your show belongs on this list and is not, the DMs
    // are open", which is a submission form being run by hand. This is it.
    // published defaults TRUE at the database, so a card holder's date is live
    // the moment they add it and the desk pulls it if it is wrong.
    CAL_KINDS: ["show", "drop", "release", "booth", "festival", "other"],

    async calendar(limit = 60, fromDate = null) {
      const c = sb(); if (!c) return [];
      // Today in the VIEWER's own timezone, not UTC. toISOString() would roll a
      // date over at 7pm in San Antonio and drop tonight's show off the rail.
      const d = fromDate || (() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
      })();
      const BASE = "id,title,kind,on_date,start_time,city,venue,link,note,by,by_name";
      // 025 is live, so the credit rides along (the Music tab's lineup and the
      // Run say whose night it is). It only SELECTs the column, never filters on
      // it, so a database without 025 steps down a shape and loses just that.
      return await calTry(cols => c.from("calendar")
        .select(cols)
        .gte("on_date", d)
        // restate the order: a view's ORDER BY is not guaranteed to survive LIMIT
        .order("on_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .limit(limit), BASE + "," + CAL_EXCH + "," + CAL_CREDIT, BASE + "," + CAL_EXCH, BASE);
    },

    async calendarPast(limit = 40) {
      const c = sb(); if (!c) return [];
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
      const BASE = "id,title,kind,on_date,start_time,city,venue,link,note,by,by_name";
      // the credit rides along here too (wave 2): /dates/ reads whose night a past date was off this
      return await calTry(cols => c.from("calendar")
        .select(cols)
        .lt("on_date", today)
        .order("on_date", { ascending: false }).limit(limit),
        BASE + "," + CAL_EXCH + "," + CAL_CREDIT, BASE + "," + CAL_EXCH, BASE);
    },

    // The desk's view: unpublished rows included, so a pulled date is still
    // visible to the person who has to decide about it.
    async calendarAll(limit = 200) {
      const c = sb(); if (!c) return [];
      // ⛔ profiles!submitted_by, NOT a bare profiles(...). 025 adds a SECOND
      // foreign key to profiles (credited_to), and PostgREST refuses an embed it
      // cannot tell apart (PGRST201, which calTry does not step down on), so the
      // board's RUN and the desk's /dates/ would both have come back empty the
      // day 025 runs. The hint names the column, works before 025 and after, and
      // the key in the JSON is still `profiles`.
      const BASE = "id,submitted_by,title,kind,on_date,start_time,city,venue,link,note," +
                   "published,created_at, profiles!submitted_by(display_name,card_slug)";
      // The DESK reads the base table, not the view, so it wants the raw uuid.
      // The board resolves it against its own members list rather than paying
      // for a second embed.
      // ⛔ The cap is taken from the NEWEST end, then the rows are handed back
      // oldest first as they always were. Capped ascending, a full table kept
      // last year and dropped the upcoming dates and the open house asks.
      const rows = await calTry(cols => c.from("calendar_dates")
        .select(cols)
        .order("on_date", { ascending: false }).limit(limit),
        BASE + "," + CAL_EXCH + ",credited_to", BASE + "," + CAL_EXCH, BASE);
      return rows.slice().reverse();
    },

    async myDates() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const BASE = "id,title,kind,on_date,start_time,city,venue,link,note,published";
      return await calTry(cols => c.from("calendar_dates")
        .select(cols)
        .eq("submitted_by", user.id).order("on_date", { ascending: true }),
        BASE + "," + CAL_EXCH, BASE);
    },

    async datesFor(slug, limit = 12) {
      const c = sb(); if (!c || !slug) return [];
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
      const BASE = "id,title,kind,on_date,start_time,city,venue,link,note";
      const orable = CAL_SLUG_OK.test(slug);
      return await calTry((cols, tier) => {
        let q = c.from("calendar").select(cols);
        // Tier 0 is the only shape that knows the column exists.
        // ⛔ NOT `by.eq.X,credit.eq.X`. That COPIES a credited night onto two
        // pages: the desk typed every row on this calendar, so a night credited
        // to Sinik would still sit on the desk's own page too, which is the exact
        // thing this column exists to stop. A credit MOVES a night. It belongs to
        // whoever is credited, and falls back to the submitter only when nobody is.
        q = (tier === 0 && orable)
          ? q.or(`credit.eq.${slug},and(credit.is.null,by.eq.${slug})`)
          : q.eq("by", slug);
        return q.gte("on_date", today)
                .order("on_date", { ascending: true }).limit(limit);
      }, BASE + "," + CAL_EXCH + "," + CAL_CREDIT, BASE + "," + CAL_EXCH, BASE);
    },

    async addDate({ title, kind, onDate, startTime, city, venue, link, note, wantHouse }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      if (!title || !String(title).trim()) throw new Error("Needs a name.");
      if (!onDate) throw new Error("Needs a date.");
      const row = {
        submitted_by: user.id,
        title: NO_DASH(String(title).trim()).slice(0, 90),
        kind: OTP.CAL_KINDS.indexOf(kind) !== -1 ? kind : "show",
        on_date: onDate,
        start_time: startTime || null,
        city: (city || "").trim() || null,
        venue: (venue || "").trim() || null,
        link: (link || "").trim() || null,
        note: NO_DASH((note || "").trim()).slice(0, 240) || null,
      };
      // The ask, not the answer. house_status and event_slug are the desk's and
      // the trigger pins them, so there is nothing to send for either.
      if (wantHouse !== undefined) row.want_house = !!wantHouse;
      let r = await c.from("calendar_dates").insert(row).select("id").single();
      if (r.error && r.error.code === "42703" && "want_house" in row) {
        // 022 has not been run here. The date is still worth putting up.
        console.warn("addDate: no exchange columns yet, saving the date without the ask");
        delete row.want_house;
        r = await c.from("calendar_dates").insert(row).select("id").single();
      }
      const { data, error } = r;
      if (error) {
        // The link CHECK is the one a member will actually trip, so it gets a
        // sentence instead of a constraint name.
        if (error.code === "23514" && /link/.test(error.message || ""))
          throw new Error("That link has to start with https:// and be a real address.");
        if (error.code === "23514") throw new Error("Something is too long, or the date is not a real one.");
        throw error;
      }
      return data;
    },

    async updateDate(id, f) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (f.title !== undefined) patch.title = NO_DASH(String(f.title).trim()).slice(0, 90);
      if (f.kind !== undefined && OTP.CAL_KINDS.indexOf(f.kind) !== -1) patch.kind = f.kind;
      if (f.onDate !== undefined) patch.on_date = f.onDate;
      if (f.startTime !== undefined) patch.start_time = f.startTime || null;
      if (f.city !== undefined) patch.city = (f.city || "").trim() || null;
      if (f.venue !== undefined) patch.venue = (f.venue || "").trim() || null;
      if (f.link !== undefined) patch.link = (f.link || "").trim() || null;
      if (f.note !== undefined) patch.note = NO_DASH((f.note || "").trim()).slice(0, 240) || null;
      if (f.wantHouse !== undefined) patch.want_house = !!f.wantHouse;
      let r = await c.from("calendar_dates").update(patch).eq("id", id).select("id");
      if (r.error && r.error.code === "42703" && "want_house" in patch) {
        console.warn("updateDate: no exchange columns yet, saving the rest");
        delete patch.want_house;
        r = await c.from("calendar_dates").update(patch).eq("id", id).select("id");
      }
      const { data, error } = r;
      if (error) {
        if (error.code === "23514" && /link/.test(error.message || ""))
          throw new Error("That link has to start with https:// and be a real address.");
        throw error;
      }
      if (!data || !data.length) throw new Error("That date is not yours to edit.");
    },

    async deleteDate(id) {
      if (!(await dropDate(id))) throw new Error("That date is not yours to remove.");
    },

    async setDatePublished(id, on) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data, error } = await c.from("calendar_dates").update({ published: !!on }).eq("id", id).select("id");
      if (error) throw error;
      return (data || []).length;
    },

    // ---- THE EXCHANGE, the desk's half (022) --------------------------------
    // A member asks with want_house. This answers. The trigger refuses it from
    // anybody who is not the desk, so this failing quietly on a member is the
    // database working, not a bug.
    HOUSE_STATES: ["none", "on_list", "shot"],

    async setDateHouse(id, { status, eventSlug }) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const patch = {};
      if (status !== undefined) {
        if (OTP.HOUSE_STATES.indexOf(status) === -1) throw new Error("Not a state the house has.");
        patch.house_status = status;
      }
      if (eventSlug !== undefined) {
        const v = String(eventSlug || "").trim().toLowerCase();
        if (v && !/^[a-z0-9][a-z0-9-]{2,80}$/.test(v))
          throw new Error("That is not an /events/ folder name.");
        patch.event_slug = v || null;
      }
      // 'shot' with nothing to point at is a promise with no frames behind it.
      // The CHECK refuses it too; this says why in words instead of a code.
      if (patch.house_status === "shot" && patch.event_slug === null)
        throw new Error("Say which /events/ folder the frames landed in first.");
      const { data, error } = await c.from("calendar_dates")
        .update(patch).eq("id", id).select("id,house_status,event_slug");
      if (error) {
        if (error.code === "42703")
          throw new Error("Run migration-022-the-exchange.sql first.");
        if (error.code === "23514")
          throw new Error("A night marked shot needs an /events/ folder on it.");
        throw error;
      }
      if (!data || !data.length) throw new Error("The desk is the only one who can answer that.");
      return data[0];
    },

    // ---- WHOSE NIGHT IT IS (025) -----------------------------------------
    // Separate from setDateHouse on purpose: house_status answers "is the house
    // coming", credited_to answers "whose night is this", and folding them into
    // one call would mean every touch of one rewrote the other.
    //
    // ⛔ Takes a card_slug and resolves it here, because the column is a uuid.
    //    025 explains why it is a uuid: profiles' only uniqueness on card_slug
    //    is an expression index AND a partial one, and Postgres will not hang a
    //    foreign key on either.
    async setDateCredit(id, cardSlug) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      let who = null;
      const slug = String(cardSlug || "").trim().toLowerCase();
      if (slug) {
        const { data: p, error: pe } = await c.from("profiles")
          .select("id,card_slug").eq("card_slug", slug).limit(1);
        if (pe) throw pe;
        if (!p || !p.length) throw new Error("Nobody holds the card " + slug + ".");
        who = p[0].id;
      }
      const { data, error } = await c.from("calendar_dates")
        .update({ credited_to: who }).eq("id", id).select("id,credited_to");
      if (error) {
        if (error.code === "42703")
          throw new Error("Run migration-025-whose-night-it-is.sql first.");
        throw error;
      }
      // The guard pins this for anybody who is not the desk, so a silent no-op
      // here is a permission answer, not a missing row.
      if (!data || !data.length) throw new Error("The desk is the only one who can say whose night it is.");
      if ((data[0].credited_to || null) !== who)
        throw new Error("The database kept the old credit. That write was not yours to make.");
      return data[0];
    },

    // The nights the house actually shot for one card holder, newest first.
    // ⛔ datesFor() is upcoming only. This is the OTHER half and it is the half
    //    that brings somebody back: a date that has passed and come back with
    //    frames on it is the only thing on a member page that changes without
    //    them touching it.
    async shotFor(slug, limit = 12) {
      const c = sb(); if (!c || !slug) return [];
      const BASE = "id,title,kind,on_date,city,venue,house_status,event_slug";
      // ⛔ This one kept its own try/catch instead of using calTry, and the
      // catch returned [] on 42703, which was right when the only thing that
      // could be missing was the whole exchange. Now that there are two
      // possible missing columns it has to step DOWN rather than give up: a
      // database on 022 still has real shot nights to show, it just cannot
      // answer the credit half of the question.
      try {
        const orable = CAL_SLUG_OK.test(slug);
        return (await calTry((cols, tier) => {
          let q = c.from("calendar").select(cols);
          // ⛔ NOT `by.eq.X,credit.eq.X`. That COPIES a credited night onto two
          // pages: the desk typed every row on this calendar, so a night credited
          // to Sinik would still sit on the desk's own page too, which is the exact
          // thing this column exists to stop. A credit MOVES a night. It belongs to
          // whoever is credited, and falls back to the submitter only when nobody is.
          q = (tier === 0 && orable)
            ? q.or(`credit.eq.${slug},and(credit.is.null,by.eq.${slug})`)
            : q.eq("by", slug);
          return q.eq("house_status", "shot")
                  .order("on_date", { ascending: false }).limit(limit);
        }, BASE + "," + CAL_CREDIT, BASE)).filter(r => r.event_slug);
      } catch (e) {
        // A database with no exchange at all has no house_status to filter on,
        // so there is nothing to show and that is not an error worth throwing.
        if (e && e.code === "42703") return [];
        throw e;
      }
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

      const [posts, stories, videos, track, dates, shot] = await Promise.all([
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
          // 045: a house story is the desk's, filed by the house, not a line on
          // the desk's own card page
          const { data, error } = await c.from("word_stories")
            .select("slug,title,dek,cover_url,baked,created_at")
            .eq("card_slug", slug).eq("house", false).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        }),
        one(async () => {
          // the one they starred first, the same order as the public rail
          const { data, error } = await c.from("videos")
            .select("id,provider,vid,title,link,cover,featured,created_at")
            .eq("by", slug)
            .order("featured", { ascending: false })
            .order("created_at", { ascending: false });
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
        // 020 may not be run on this database yet. one() swallows that and the
        // rail simply does not appear, which is the right failure for a section
        // that is additive to a page that already works.
        one(async () => await OTP.datesFor(slug, 12)),
        // 022. The nights that already happened and came back with frames. This
        // is the only rail on the page that fills up without them touching it.
        one(async () => await OTP.shotFor(slug, 12)),
      ]);
      return { card, posts, stories, videos, tracks: track,
               dates: dates || [], shot: shot || [] };
    },

    // ---- THEIR LINKS (migration 021) -------------------------------------
    // ⛔ PLATFORM + HANDLE, never a URL. The page rebuilds the host from a
    // hardcoded base, so a member cannot point their own page at anything but
    // their profile on a site the house already trusts. Same doctrine as 007.
    LINK_PLATFORMS: ["instagram", "tiktok", "youtube", "x", "twitch",
                     "threads", "spotify", "soundcloud", "bandcamp"],

    async myLinks() {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("profiles").select("links").eq("id", user.id).maybeSingle();
      if (error) return [];
      return Array.isArray(data && data.links) ? data.links : [];
    },

    async saveMyLinks(list) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const { data: { user } } = await c.auth.getUser();
      if (!user) throw new Error("Log in first.");
      const clean = (Array.isArray(list) ? list : [])
        .map(l => ({
          p: String((l && l.p) || "").toLowerCase().trim(),
          h: String((l && l.h) || "").trim().replace(/^@/, ""),
        }))
        .filter(l => OTP.LINK_PLATFORMS.indexOf(l.p) !== -1 && /^[A-Za-z0-9._-]{1,30}$/.test(l.h))
        .slice(0, 5);
      const { error } = await c.from("profiles").update({ links: clean }).eq("id", user.id);
      if (error) {
        if (error.code === "42703")
          throw new Error("Links are not switched on yet. Run migration-021-their-links.sql.");
        if (error.code === "23514")
          throw new Error("A handle can only be letters, numbers, dots, dashes and underscores, up to 30.");
        throw error;
      }
      return clean;
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
      const skipped = [];
      (list || []).slice(0, 3).forEach((raw, i) => {
        const t = OTP.readTrack(raw);
        // A typo in slot 2 must not block slots 1 and 3, but it must not
        // vanish either: the caller is handed what did not take, and why.
        if (!t.id) { if (!t.empty) skipped.push({ n: i + 1, why: t.why }); return; }
        if (seen.has(t.id)) { skipped.push({ n: i + 1, why: "same song twice." }); return; }
        seen.add(t.id);
        rows.push({ profile_id: user.id, slot: rows.length + 1, track: t.id });
      });
      const del = await c.from("featured_tracks").delete().eq("profile_id", user.id);
      if (del.error) throw del.error;
      // `skipped` rides ON the array rather than changing the return shape, so
      // a caller that only counts rows is untouched.
      if (!rows.length) { const none = []; none.skipped = skipped; return none; }
      const { error } = await c.from("featured_tracks").insert(rows);
      if (error) throw error;
      rows.skipped = skipped;
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

    // The other shape: the WHOLE photo, never cropped and never enlarged, long
    // edge at most `edge`, JPEG. fitCardArt cover-crops to exactly W x H, which is
    // right for a card and wrong for a frame: through it a 3:2 landscape lost a
    // third of its width to a square. Resolves { blob, w, h } so the caller can
    // store the real size next to the url.
    async fitWithin(file, edge = 1600, q = 0.88) {
      const s = await shrinkStill(file, edge, q);
      return { blob: s.blob, w: s.w, h: s.h };
    },

    async myPosts(limit = 30) {
      const c = sb(); if (!c) return [];
      const { data: { user } } = await c.auth.getUser();
      if (!user) return [];
      const { data, error } = await c.from("posts")
        .select("id, text, image_url, image_alt, pinned, published, created_at, edited_at, members_only")
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
      // 033: take_feed() is the timeline now, because casual Wall members post
      // too and the `feed` view only ever saw card holders. It returns its rows
      // already ordered and capped. On a database without 033 the RPC is missing
      // and this drops back to the view, which is exactly the old behaviour.
      let rows = null;
      try {
        const rpc = await c.rpc("take_feed", { p_limit: limit });
        if (!rpc.error && Array.isArray(rpc.data)) rows = rpc.data;
      } catch (e) { /* fall through to the view */ }
      if (!rows) {
        const { data, error } = await c.from("feed").select("*")
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) { console.warn("feed unavailable:", error.message); return []; }
        rows = data || [];
      }
      return rows.map(r => ({
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
        // 033. kind: 'desk' | 'card' | 'member' (a casual Wall member, no card).
        // sid opens their space on The Wall; avatar is their space picture.
        kind: r.kind || "card",
        sid: r.sid || "",
        avatar: r.pic || "",
        mine: !!r.mine,
      }));
    },

    /* ---- the desk: his side ---- */
    async deskProfiles() {
      const c = sb(); if (!c) return [];
      const rpc = await c.rpc("desk_profiles");
      if (!rpc.error) return rpc.data || [];
      // The pre-002 fallback that used to sit here selected is_admin straight off
      // profiles, which no API role may read since 002, so it failed every time
      // and ended in this same empty list. Now it just says so in the console.
      console.warn("desk_profiles did not answer,", rpc.error.message);
      return [];
    },

    // pending(), members(), refused(), setApproved() and setDenied() moved to
    // THE MEMBERS MANAGER below (044 / 045): same names, one card rule and one
    // ask rule underneath, read from desk_members instead of filtered here.

    // ONE PLACE that turns a profile into what the door should say to them.
    // Eight surfaces used to hardcode "you're in the queue", which meant a
    // refused person read a promise that was never going to land, on every one
    // of them.
    doorNote(profile) {
      if (!profile) return { state: "out", line: "Members and card holders log in here." };
      if (profile.is_admin)  return { state: "admin", line: "Approvals and pulls." };
      if (profile.approved)  return { state: "in", line: "You are in." };
      // ⛔ REFUSED READS EXACTLY LIKE WAITING, HIS CALL. The no is a DESK tool:
      // it clears the queue so he stops re-reading the same name every time the
      // board opens. It is not an announcement. A refused person is never told,
      // which means they are also never handed something to argue with. The
      // state is still distinct here so the desk can see it; only the LINE is
      // the same, and it is the same line on every surface.
      var wait = { line: "You are in the queue. The desk approves by hand, so give it a day." };
      return profile.denied ? { state: "refused", line: wait.line }
                            : { state: "wait",    line: wait.line };
    },

    // The line to print on a card-holder page for somebody who is not one. Same as
    // doorNote, except for a Wall member who never asked for a card: they are not in
    // any queue, and "give it a day" had them waiting on an approval nobody owed them.
    async doorLine(profile) {
      const d = OTP.doorNote(profile);
      if (d.state !== "wait") return d.line;
      try {
        const c = sb(); const r = c ? await c.rpc("wall_me") : null;
        const m = r && !r.error && r.data && r.data[0];
        if (m && m.member && !m.card_ask) return "This part is for card holders. You can ask for a card in the Crypt, under Kin.";
      } catch (e) {}
      return d.line;
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

    // retireMember() and wallBan() moved to THE MEMBERS MANAGER below: both are
    // the one ban now (desk_ban), and unban puts everything back.

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
          // 033: the same key may be a casual member's photo in `take`. Removing
          // a key that is not there is not an error, so this is safe to try, but a
          // REAL failure has to stop the row being marked cleared: supabase-js
          // returns {error}, it does not throw.
          const t = await c.storage.from("take").remove([r.object_name]);
          if (t && t.error) throw t.error;
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

    // ---- YOUR ACCOUNT (044) ----
    // Call 7: log out, rename, email, password, close. A card holder's name goes
    // through the desk (his call) and there is no Instagram self-change this wave
    // ("later"), so neither exists here. Email, password and close each ask for
    // the password again first (reauth), and "Secure password change" is on.
    ACCT_SAYS: {
      name: {
        closed: "This account is closed.",
        empty: "Put a name in.",
        long: "40 characters at most.",
        taken: "That name belongs to a card holder or the house. Pick another.",
        card: "Ask the desk to change a card holder's name. Your card page follows it.",
        slow: "Three name changes a day. Try again tomorrow.",
      },
    },

    // { name, ig, kind, banned, closed, can_reopen, closed_at, card_slug, card_ask,
    //   card_want, names_left, sid } for the login, or null. Never throws.
    async account() {
      const c = sb(); if (!c) return null;
      try {
        if (!(await hasSession(c))) return null;
        const { data, error } = await c.rpc("my_account");
        if (error) { console.warn("my_account did not answer,", error.message); return null; }
        return (data && typeof data === "object" && !Array.isArray(data)) ? data : null;
      } catch (e) { return null; }
    },

    // The member's own name. The database cleans it the way the name guard does
    // and answers with a word; a word that is not ok is a sentence here.
    async setMyName(name) {
      const v = Array.from(String(name == null ? "" : name).trim()).slice(0, 40).join("");
      const r = (await call("my_rename", { p_name: v })) || {};
      if (!r.ok && r.why !== "same")
        throw new Error(OTP.ACCT_SAYS.name[r.why] || "That name did not save. Try again.");
      forgetMe();
      return { name: r.name, shared: r.shared || 0, same: r.why === "same" };
    },

    // ⛔ The desk's own email changes in the Supabase dashboard, never here: a
    // stolen desk session must not be able to move the login somewhere else.
    // Refused before anything is sent.
    async changeEmail(email, again, pw) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const m = await OTP.me();
      if (m && m.profile && m.profile.is_admin) throw new Error("The desk changes its email in the Supabase dashboard.");
      if (m && m.failed) throw new Error("Could not check your account. Try again in a minute.");
      const e = String(email == null ? "" : email).trim().toLowerCase();
      const e2 = String(again == null ? "" : again).trim().toLowerCase();
      if (!EMAIL_OK.test(e)) throw new Error("That email doesn't look right.");
      if (e !== e2) throw new Error("Those two emails don't match.");
      await reauth(c, pw);
      const { data, error } = await c.auth.updateUser({ email: e }, { emailRedirectTo: "https://0fftheprint.com/my/#account" });
      if (error) {
        const msg = String(error.message || "");
        if (error.code === "email_exists" || /already been registered/i.test(msg))
          throw new Error("That email already has an account here.");
        if (error.code === "over_email_send_rate_limit" || /rate limit/i.test(msg))
          throw new Error("Too many tries. Give it an hour.");
        throw fail(error);
      }
      forgetMe();
      return { email: e, pending: !!(data && data.user && data.user.new_email) };
    },

    async changePassword(pw, next, again) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const n = String(next == null ? "" : next);
      if (n.length < 8) throw new Error("8 characters or more.");
      if (n !== String(again == null ? "" : again)) throw new Error("Those two don't match.");
      await reauth(c, pw);
      const { error } = await c.auth.updateUser({ password: n });
      if (error) {
        const code = error.code || "", msg = String(error.message || "");
        if (code === "same_password" || /different from the old/i.test(msg)) throw new Error("That's the password you have now.");
        if (code === "weak_password") throw new Error("Pick a longer one.");
        if (code === "reauthentication_needed") throw new Error("Log out and back in, then try again.");
        throw fail(error);
      }
      forgetMe();
      return true;
    },

    // A hide, nothing deleted, so Open it again puts everything back. takeBack
    // also blanks every message they sent, which cannot be undone. The Crypt's
    // phone-only stores go with the login on this phone, then the sign out.
    async closeMyAccount(pw, note, takeBack) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      const m = await OTP.me();
      if (m && m.profile && m.profile.is_admin) throw new Error("The desk account stays open.");
      await reauth(c, pw);
      const { error } = await c.rpc("account_close", { p_reason: noteOf(note), p_take_back: !!takeBack });
      if (error) throw fail(error);
      ["wall-mine", "wall-watch", "wall-check", "wall-cal-mine", "wall-ppl-seen", "wall-fix"].forEach(k => {
        try { w.localStorage.removeItem(k); } catch (e) {}
      });
      try { await OTP.signOut(); } catch (e) { /* closed is closed; the keys above are gone */ }
      return "closed";
    },

    // 'open', or 'shut' when the desk closed it (nothing changes then).
    async reopenMyAccount() {
      const r = await call("account_reopen");
      forgetMe();
      return r;
    },

    // The card ask from Kin. slug names the card they want (a roster seat needs
    // the second tap that names it); undefined leaves an open ask's pick alone.
    // 'asked' | 'holder' | 'denied' | 'held'.
    async cardAsk(note, slug) {
      return await call("wall_card_ask", { p_note: noteOf(note), p_slug: slug == null ? null : slug });
    },

    async unaskCard() { return !!(await call("wall_card_unask")); },

    // A flyer source they sent that the desk has not looked at yet.
    async withdrawSource(id) { return !!(await call("wall_source_withdraw", { p_id: id })); },

    // ---- THE MEMBERS MANAGER (044 / 045, desk only) ----
    // Call 3: the board is the control room. Every power is one RPC that starts
    // with the desk check and writes the account log; nothing here writes a
    // table straight. A member calling any of these gets "Desk only."
    // Frames only the desk hands out (frame_grant). Kept in step with the
    // card_frame enum minus OPEN_FRAMES; the database is the gate.
    GRANT_FRAMES: ["rainbow-rare", "tera-ex", "gold-rare", "full-art", "darklord", "warlord",
                   "amazing", "diamond-rare", "vampy", "stone", "tag-team"],

    // One row per person: role 'desk' | 'card' | 'member' | 'login', state
    // 'closed' | 'banned' | 'active', asks (THE one ask rule), said_no, counts.
    // No email, ever.
    async deskMembers() {
      const d = await call("desk_members");
      return Array.isArray(d) ? d : [];
    },

    // Everything about one person (person, words, page, ask, still_public,
    // history, lists, reports), or null for nobody by that id.
    async deskMember(id) {
      return (await call("desk_member_stuff", { p_user: id })) || null;
    },

    // The next 50 of one list, older than `before` (the last row's at).
    async deskMemberItems(id, kind, before) {
      const d = await call("desk_member_items", { p_user: id, p_kind: kind, p_before: before == null ? null : before });
      return Array.isArray(d) ? d : ((d && Array.isArray(d.rows)) ? d.rows : []);
    },

    // THE one badge: what is waiting on the desk, by queue, plus the total.
    // Never throws (a badge that throws takes the nav down with it).
    async deskWaiting() {
      const KEYS = ["asks", "sources", "reports", "packs", "rooms", "picks", "comments", "stories", "house", "photos_up", "total"];
      const z = {}; KEYS.forEach(k => { z[k] = 0; });
      const c = sb(); if (!c) return z;
      let r;
      try { r = await c.rpc("desk_waiting"); } catch (e) { return z; }
      if (!r.error) {
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (row && typeof row === "object") KEYS.forEach(k => { z[k] = Number(row[k]) || 0; });
        return z;
      }
      if (r.error.code !== "PGRST202") return z;
      // A database without 045 has no desk_waiting. Add up what it can answer:
      // card asks and sources (032), packs (037), rooms (038), reported chats
      // (040). Each one that fails counts 0.
      const one = async fn => { try { return await fn(); } catch (e) { return 0; } };
      const [counts, packs, rooms, dms] = await Promise.all([
        one(async () => { const q = await c.rpc("wall_desk_counts"); return (!q.error && Array.isArray(q.data) && q.data[0]) || 0; }),
        one(async () => { const q = await c.rpc("desk_packs"); return q.error ? 0 : (q.data || []).filter(p => !p.published).length; }),
        one(async () => { const q = await c.rpc("rooms_list"); return q.error ? 0 : (q.data || []).filter(x => !x.published && !x.mine).length; }),
        one(async () => { const q = await c.rpc("dm_desk_count"); return q.error ? 0 : (Number(q.data) || 0); }),
      ]);
      z.asks = Number(counts && counts.asks) || 0;
      z.sources = Number(counts && counts.sources) || 0;
      z.packs = packs; z.rooms = rooms; z.reports = dms;
      z.total = z.asks + z.sources + z.packs + z.rooms + z.reports;
      return z;
    },

    // Packs and rooms waiting (oldest first) and pending sources, or null.
    async deskQueue() { return await call("desk_queue"); },

    // THE one card rule. Yes makes them a card holder and hands back the card
    // slug (slug names one; a roster seat is only ever handed out by name).
    // No is the quiet no: they are never told, and it reads like waiting.
    async cardDecide(id, yes, slug) {
      if (yes) return await call("desk_card", { p_user: id, p_on: true, p_slug: slug || null });
      await call("wall_card_decide", { p_user: id, p_yes: false });
      return "denied";
    },

    // Take the card back. They stay a member; card_slug and the frame grant are
    // kept, so making them a card holder again hands back the same card.
    async takeCard(id) { return await call("desk_card", { p_user: id, p_on: false }); },

    // Take back the no: they are back in Wants a card, not in.
    async unNo(id) { return !!(await call("desk_unno", { p_user: id })); },

    // THE one ban: off the Crypt and the whole site at once, and unban puts every
    // last thing back (a Revoke from before 044 republishes its pulled posts).
    // 'banned' | 'active' | 'closed' (unbanned but still closed).
    async ban(id, on, note) {
      return await call("desk_ban", { p_user: id, p_on: !!on, p_note: noteOf(note) });
    },

    // Close somebody (a hide, undoable). A desk close shows them the shut lock.
    async deskClose(id, note) { return await call("desk_close", { p_user: id, p_note: noteOf(note) }); },
    async deskReopen(id) { return await call("desk_reopen", { p_user: id }); },

    // Fix their info (power b). The database cleans and checks, and logs it.
    async renameMember(id, name) {
      return await call("desk_set_name", { p_user: id, p_name: String(name == null ? "" : name).trim() });
    },
    // 'ok' | 'cleared' | 'same' | 'taken' | 'bad'. Clearing frees the handle.
    async setMemberIg(id, ig) {
      return await call("desk_set_instagram", { p_user: id, p_ig: String(ig == null ? "" : ig).trim() });
    },
    async setFrameGrant(id, frame) {
      return await call("desk_set_frame", { p_user: id, p_frame: frame || null });
    },
    // Their card song, which the mirror copies to their Crypt page. A link that
    // does not read is refused here, before anything is sent; blank clears it.
    async setMemberSong(id, { song, start } = {}) {
      const t = OTP.readTrack(song);
      if (!t.id && !t.empty) throw new Error(t.why);
      const n = parseInt(start, 10);
      return await call("desk_set_song", {
        p_user: id, p_track: t ? t.id : null,
        p_start: Number.isFinite(n) && n > 0 ? Math.min(n, 3600) : null,
      });
    },

    // Clear one thing off their card or Crypt page: page | pic | wallpaper |
    // pic_one | about | headline | mood | meet | song | links | link_one | tracks.
    // pic_one takes the picture's url; link_one takes 'platform:handle'. The
    // database clears, then names the files nothing else uses, and they come off
    // storage here.
    async clearSpace(id, what, url) {
      const r = (await call("desk_space_clear", { p_user: id, p_what: what, p_url: url == null ? null : url })) || {};
      const removed = await dropFiles(r.files);
      return { cleared: r.cleared == null ? null : r.cleared, removed };
    },

    // The board's member sheet ticks (I156). Every tick is one clearSpace now:
    // no table write is left in here, and each one is logged.
    async clearMemberCard(id, { photo, links, song, tracks } = {}) {
      const out = { cleared: [], removed: 0 };
      const ticks = [[photo, "pic"], [links, "links"], [song, "song"], [tracks, "tracks"]];
      for (const [on, what] of ticks) {
        if (!on) continue;
        const r = await OTP.clearSpace(id, what);
        out.cleared.push(what); out.removed += r.removed;
      }
      return out;
    },

    // Waiting vs said no: mark one row as seen (story | pick | story_comment |
    // pack | room), or every waiting row of a kind (refusals from before 045).
    async deskMarkRead(kind, id) {
      const n = Number(await call("desk_mark_read", { p_kind: kind, p_id: id == null ? null : id })) || 0;
      if (id != null && !n) throw new Error("That one is already gone.");
      return n;
    },
    async deskMarkAllSeen(kind) {
      return Number(await call("desk_mark_read", { p_kind: kind, p_id: null })) || 0;
    },

    async sourceDecide(id, status) { return await call("wall_source_decide", { p_id: id, p_status: status }); },
    async packDecide(id, on) { return await call("pack_publish", { p_id: id, p_on: !!on }); },
    async roomDecide(id, on) { return await call("room_publish", { p_id: id, p_on: !!on }); },

    // Hide (or show again) and delete anything a member made, from one table
    // (DESK_KINDS, under this object): post, take_comment, flyer_comment, pack,
    // room, space_post, frame_tag, story, story_comment, pick, video, date,
    // dm_message, space. extra carries {user, slug, media} for a frame tag and
    // {user} for a page. Something already gone says so.
    async deskHide(kind, id, hide) {
      const k = DESK_KINDS[kind];
      if (!k) throw new Error("That is not something the desk can hide.");
      if (!k.hide) throw new Error(k.only);
      return await k.hide(id, hide === undefined ? true : !!hide);
    },
    async deskDelete(kind, id, extra) {
      const k = DESK_KINDS[kind];
      if (!k) throw new Error("That is not something the desk can delete.");
      return await k.del(id, extra || {});
    },

    // Same names as before, one rule underneath each.
    async wallBan(id, on) { return await OTP.ban(id, on); },
    // The old Revoke is the ban now; there is no pull batch to hand back, and
    // unban republishes. Returns null where it used to return a batch.
    async retireMember(id) { await OTP.ban(id, true, "revoked"); return null; },
    async setApproved(id, on) { return on ? await OTP.cardDecide(id, true) : await OTP.takeCard(id); },
    async setDenied(id, on) { return on ? await OTP.cardDecide(id, false) : await OTP.unNo(id); },
    // The three old lists, off the one desk read. Each row also carries the
    // pre-045 names the pages already read (display_name, is_admin, approved,
    // denied), so a page that has not moved to deskMembers keeps working.
    async pending() { return (await OTP.deskMembers()).filter(p => p.asks).map(deskRow); },
    async members() {
      return (await OTP.deskMembers())
        .filter(p => (p.role === "card" || p.role === "desk") && p.state === "active").map(deskRow);
    },
    async refused() { return (await OTP.deskMembers()).filter(p => p.said_no).map(deskRow); },

    // ---- REPORTS, BLOCKS, EDITS (044 / 045) ----
    // Calls 8 and 9: a report button on comments, packs, pages, rooms and frame
    // tags, one list on the board, Block that means block, and fixing your own
    // comment (no time window; the 'edited' tag tells readers).
    REPORT_WHY: {
      mean: "Mean or a threat",
      spam: "Spam",
      private: "Private stuff",
      not_them: "Not theirs to post",
      other: "Something else",
    },

    // The chips for one kind, as [why, label] pairs.
    reportChoices(kind) {
      const W = OTP.REPORT_WHY, pick = keys => keys.map(k => [k, W[k]]);
      if (kind === "frame_tag") return [["not_them", "That is not them"], ["other", "Something else"]];
      if (kind === "space" || kind === "post" || kind === "pack" || kind === "room")
        return pick(["mean", "spam", "private", "not_them", "other"]);
      return pick(["mean", "spam", "private", "other"]);
    },

    // 'sent' | 'already'. The database works out whose it is; a page never says.
    async report(kind, target, why, note) {
      const c = sb(); if (!c) throw new Error("Backend not configured yet.");
      let r;
      try {
        r = await c.rpc("report_add", { p_kind: kind, p_target: String(target), p_why: why || null, p_note: noteOf(note) });
      } catch (e) { throw new Error("That did not send. Try again."); }
      if (r.error) {
        // 'Members only.' from report_add, or Postgres refusing anon the door
        // itself (a page still painted after its login ended)
        if (/members only|permission denied/i.test(r.error.message || "")) throw new Error("Reporting is for members.");
        // a refusal written for a person (gone already, yours, the house's, a lot today)
        if (r.error.code === "22023" || r.error.code === "42501") throw fail(r.error);
        throw new Error("That did not send. Try again.");
      }
      return r.data === "already" ? "already" : "sent";
    },

    // Which of these targets the caller has an open report on, as a Set of
    // strings (first 200). Never throws.
    async myReports(kind, targets) {
      const out = new Set();
      const c = sb();
      const list = (Array.isArray(targets) ? targets : []).map(String).slice(0, 200);
      if (!c || !list.length) return out;
      try {
        if (!(await hasSession(c))) return out;
        const r = await c.rpc("report_mine", { p_kind: kind, p_targets: list });
        if (!r.error && Array.isArray(r.data)) r.data.forEach(t => out.add(String(t)));
      } catch (e) {}
      return out;
    },

    // Fix your own comment: 'take' (the timeline and the Roll) or 'flyer' (the Crypt).
    async editComment(where, id, body) {
      const fn = where === "take" ? "take_comment_edit" : where === "flyer" ? "wall_comment_edit" : null;
      if (!fn) throw new Error("Fix which comment?");
      await call(fn, { p_id: id, p_body: NO_DASH(body) });
      return true;
    },

    // Block whoever wrote this comment (take_comment | flyer_comment | space_post).
    async blockAuthor(kind, target) {
      return !!(await call("dm_block_author", { p_kind: kind, p_target: String(target) }));
    },
    async blockedList() {
      const d = await call("dm_blocked_list");
      return Array.isArray(d) ? d : [];
    },
    async unblock(sid) { return await call("dm_block", { p_sid: sid, p_on: false }); },

    // The desk's one list: one entry per reported thing, open first.
    async deskReports({ state = "open", about = null, by = null, limit = 100 } = {}) {
      const d = await call("report_desk_queue", { p_state: state, p_about: about, p_by: by, p_limit: limit });
      return Array.isArray(d) ? d : [];
    },
    async deskReportCount() {
      try { return Number(await call("report_desk_count")) || 0; } catch (e) { return 0; }
    },
    async closeReport(kind, target, outcome = "kept") {
      return await call("report_desk_close", { p_kind: kind, p_target: String(target), p_outcome: outcome });
    },

    // keep | hide | unhide | remove one reported (or any) thing. The database
    // closes the reports on it and names the files that can go.
    async deskAct(kind, target, how) {
      const r = (await call("desk_item_act", { p_kind: kind, p_target: String(target), p_do: how })) || {};
      await dropFiles(r.files);
      return { outcome: r.outcome, changed: r.changed, closed: r.closed, files: Array.isArray(r.files) ? r.files : [] };
    },

    // One message in a chat somebody in it reported. Both of them see
    // "removed by the desk". Unreported chats are never read.
    async deskRemoveMessage(id) {
      if (!(await call("dm_desk_remove", { p_id: id }))) throw new Error("Only a message in a reported chat.");
      return true;
    },
    async dmDeskReports() {
      const d = await call("dm_desk_reports");
      return Array.isArray(d) ? d : [];
    },
    async dmDeskClose(thread) { return await call("dm_desk_close", { p_thread: thread }); },

    // What a member story said before each edit (the desk reads these).
    async storyRevisions(storyId) {
      const c = sb(); if (!c) return [];
      const { data, error } = await c.from("member_story_revisions")
        .select("title,dek,body_md,cover_url,replaced_at")
        .eq("story_id", storyId)
        .order("replaced_at", { ascending: false });
      if (error) throw fail(error);
      return data || [];
    },

    // ---- ONE PROFILE (044) ----
    // Call 2: one photo and one song per card holder, shared by the card and the
    // Crypt page, and one list of who holds a card. A banned, closed or demoted
    // holder's roster seat goes dark everywhere (the pack, the binder, Music).

    // Card slugs whose holder is banned, closed or demoted. Never throws.
    async darkSeats() {
      const c = sb(); if (!c) return [];
      try {
        const { data, error } = await c.rpc("dark_seats");
        if (error || !Array.isArray(data)) return [];
        return data.filter(s => typeof s === "string" && s);
      } catch (e) { return []; }
    },

    // ⛔ PURE: no network, no DOM, so a page or a test can call it on its own
    // list. The house list (roster.json) is the floor; a DB card row patches the
    // seat it belongs to IN PLACE, and a card holder with no seat is appended.
    // Seat to row: card_slug, then slugify(name), then tight(name).
    // opts.hide: slugs to leave out. opts.dark: slugs whose seat goes dark.
    peopleMerge(list, rows, opts) {
      const o = opts || {};
      const low = s => String(s == null ? "" : s).trim().toLowerCase();
      const hide = new Set();
      (o.hide || []).forEach(s => { const v = low(s); if (v) { hide.add(v); hide.add(tight(v)); } });
      const dark = new Set(), darkTight = new Set();
      (o.dark || []).forEach(s => { const v = low(s); if (v) { dark.add(v); darkTight.add(tight(v)); } });
      const by = {}, byTight = {};
      (Array.isArray(rows) ? rows : []).forEach(rw => {
        const s = rw && low(rw.card_slug);
        if (!s) return;
        if (!by[s]) by[s] = rw;
        if (!byTight[tight(s)]) byTight[tight(s)] = rw;
      });
      const linkFor = rw => {
        const first = Array.isArray(rw.links) ? rw.links[0] : null;
        return (first && linkOf(first.p, first.h)) || linkOf(rw.link_platform, rw.link_handle);
      };
      const used = new Set(), out = [];
      (Array.isArray(list) ? list : []).forEach(item => {
        if (!item || typeof item !== "object") return;
        const own = low(item.card_slug), sl = slugify(item.name), ti = tight(item.name);
        let rw = (own && by[own]) || (sl && by[sl]) || (ti && byTight[ti]) || null;
        if (rw && used.has(rw)) rw = null;               // one row, one seat
        const slug = rw ? low(rw.card_slug) : "";
        if ([own, sl, ti, slug, tight(slug)].some(k => k && hide.has(k))) { if (rw) used.add(rw); return; }
        // A seat names its card (card_slug). An older list without one goes by
        // its name, because a stranger never gets the dark holder's row to match.
        const isDark = (own ? dark.has(own) : (dark.has(sl) || darkTight.has(ti))) || (slug && dark.has(slug));
        if (isDark) { if (rw) used.add(rw); return; }
        if (rw) {
          used.add(rw);
          const house = ("art" in item) ? item.art : item.photo;   // the house art stays on item.art
          item.art = house;
          item.photo = rw.card_photo || house;
          item.rarity = rw.card_frame || item.rarity;
          item.display_name = rw.display_name || item.display_name || item.name;
          item.card_slug = rw.card_slug;
          // ALWAYS: a song the holder cleared must not fall back to the seed
          item.theme_song = rw.theme_song || "";
          item.theme_start = rw.theme_start || 0;
          if (Array.isArray(rw.featured) && rw.featured.length) item.featured = rw.featured.slice(0, 3);
          const l = linkFor(rw);
          if (l) { item.link = l.link; item.platform = l.platform; }
          item.tagline = rw.tagline || "";
          item.bio = rw.bio || "";
          item.hasDb = true;
        }
        out.push(item);
      });
      const extra = [];
      Object.keys(by).forEach(s => {
        const rw = by[s];
        if (used.has(rw) || dark.has(s) || hide.has(s) || hide.has(tight(s)) || !CARD_SLUG_OK.test(s)) return;
        used.add(rw);
        const name = String(rw.display_name || "").trim() || s;
        const l = linkFor(rw);
        extra.push({
          name, display_name: name, card_slug: rw.card_slug,
          photo: rw.card_photo || "", rarity: rw.card_frame || "common",
          type: "take", type_label: "CARD HOLDER", hp: 100, moves: [],
          flavor: rw.tagline || "", lore: rw.bio || "", tagline: rw.tagline || "", bio: rw.bio || "",
          theme_song: rw.theme_song || "", theme_start: rw.theme_start || 0,
          featured: Array.isArray(rw.featured) ? rw.featured.slice(0, 3) : [],
          link: l ? l.link : "c/" + s + "/", platform: l ? l.platform : "Card",
          pending_glyph: tight(name).slice(0, 3).toUpperCase() || "0FF", pending_stamp: "PHOTO PENDING",
          page: "c/" + s + "/", binder_key: "c-" + s, _db: true, hasDb: true,
        });
      });
      extra.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }));
      return out.concat(extra);
    },

    // The merged list for this page: roster.json, the cards and the dark seats.
    // The two database reads get 3 s; losing means roster.json alone. One answer
    // per page load ({fresh: true} asks again). Never throws.
    people(opts) {
      if (peopleP && !(opts && opts.fresh)) return peopleP.then(l => l.slice());
      const late = (fn, none) => Promise.race([
        Promise.resolve().then(fn).catch(() => none),
        new Promise(ok => setTimeout(() => ok(none), PEOPLE_WAIT_MS)),
      ]);
      // the library not up yet is not an answer to keep, the same rule as me()
      let floorOk = false;
      const live = !!sb();
      const p = peopleP = (async () => {
        const db = Promise.all([late(() => OTP.cards(), []), late(() => OTP.darkSeats(), [])]);
        let list = [];
        try {
          if (ROOT) {
            const r = await fetch(ROOT + "content/roster.json", { cache: "no-cache" });
            const j = r && r.ok ? await r.json() : null;
            if (j && Array.isArray(j.items)) { list = j.items; floorOk = true; }
          }
        } catch (e) { list = []; }
        const [rows, dark] = await db;
        return OTP.peopleMerge(list, Array.isArray(rows) ? rows : [], { dark: Array.isArray(dark) ? dark : [] });
      })().catch(() => []);
      // a page that could not read roster.json (or had no client yet) asks again next time
      p.then(() => { if ((!floorOk || !live) && peopleP === p) peopleP = null; });
      return p.then(l => l.slice());
    },

    // The sid of a card holder's Crypt page, for a signed-in viewer who may see
    // it, else null. Strangers get null without a call. Never throws.
    async cryptPageOf(slug) {
      const s = String(slug == null ? "" : slug).trim().toLowerCase();
      const c = sb(); if (!c || !CARD_SLUG_OK.test(s)) return null;
      try {
        if (!(await hasSession(c))) return null;
        const { data, error } = await c.rpc("wall_page_of", { p_slug: s });
        return (!error && typeof data === "string" && data) ? data : null;
      } catch (e) { return null; }
    },

    // ---- FRAMES BY NAME (043) ----
    // Call 15: a tag names the photo ('017', 'v01'), not its place in the
    // lightbox, so a photo taken down or added never moves anybody's tag.
    FRAME_NAME_OK: /^[a-z0-9][a-z0-9_-]{0,40}$/,

    // 'media/017_t.jpg' -> '017', or null.
    frameName(thumb) {
      const m = /(?:^|\/)media\/([^\/?#]+?)_t\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.exec(String(thumb == null ? "" : thumb));
      const stem = m ? m[1].toLowerCase() : "";
      return OTP.FRAME_NAME_OK.test(stem) ? stem : null;
    },
    frameThumb(slug, media, base = "") {
      const s = String(slug == null ? "" : slug), m = String(media == null ? "" : media);
      if (!NIGHT_SLUG_OK.test(s) || !OTP.FRAME_NAME_OK.test(m)) return "";
      return `${base}events/${s}/media/${m}_t.jpg`;
    },
    frameLink(slug, media, base = "") {
      const s = String(slug == null ? "" : slug), m = String(media == null ? "" : media);
      if (!NIGHT_SLUG_OK.test(s)) return "";
      return OTP.FRAME_NAME_OK.test(m) ? `${base}events/${s}/#m${m}` : `${base}events/${s}/`;
    },

    // I'm in this one (or not). frame is the position it sat at, kept as a note.
    async tagFrame(slug, media, on, frame) {
      return await call("frame_tag_by_name", {
        p_slug: slug, p_media: media, p_on: !!on,
        p_frame: Number.isInteger(frame) ? frame : null,
      });
    },
    async myFrames() {
      const c = sb(); if (!c) return [];
      if (!(await hasSession(c))) return [];
      const d = await call("my_frames");
      return Array.isArray(d) ? d : [];
    },
    // Members only. A stranger gets [] with no call, what the database already
    // answers a login that is not in the Crypt.
    async framesOf(sid) {
      const c = sb(); if (!c) return [];
      if (!(await hasSession(c))) return [];
      const d = await call("frames_of", { p_sid: sid });
      return Array.isArray(d) ? d : [];
    },
    async frameTagsOf(slug) {
      const c = sb(); if (!c) return [];
      if (!(await hasSession(c))) return [];
      const d = await call("frame_tags_of", { p_slug: slug });
      return Array.isArray(d) ? d : [];
    },
    // Photos that came down (no names), for anybody: the laptop step reads it.
    async framesDown(slug = null) { const d = await call("frames_down", { p_slug: slug }); return Array.isArray(d) ? d : []; },

    // The desk's side: every tag on a night, everything one person tagged.
    async deskFrameTags(slug) { const d = await call("desk_frame_tags", { p_slug: slug }); return Array.isArray(d) ? d : []; },
    async deskFramesOf(userId) { const d = await call("desk_frames_of", { p_user: userId }); return Array.isArray(d) ? d : []; },
    async deskUntagFrame(userId, slug, media) {
      if (!(await call("desk_frame_untag", { p_user: userId, p_slug: slug, p_media: media })))
        throw new Error("That tag is already gone.");
      return true;
    },
    // Take a photo down: the tags come off now, takedown.py takes the file off
    // the night later. Returns how many tags came off.
    async takeFrameDown(slug, media, frame, note) {
      const n = await call("desk_frame_takedown", {
        p_slug: slug, p_media: media,
        p_frame: Number.isInteger(frame) ? frame : null, p_note: noteOf(note),
      });
      if (n === -1) throw new Error("That photo is already down.");
      return Number(n) || 0;
    },
    async undoFrameDown(slug, media) {
      return Number(await call("desk_frame_takedown_undo", { p_slug: slug, p_media: media })) || 0;
    },
    async frameTakedowns() { const d = await call("desk_frame_takedowns"); return Array.isArray(d) ? d : []; },

    // ---- THE RUN (call 6) ----
    // The Run is the one place for dates. The house's own card slug, for pages
    // that tell his nights from a card holder's.
    HOUSE_SLUG: "vamppsych",

    // calendar(limit), read once per page however many parts of it ask. A
    // failure is not kept, and a sign in or out forgets it (see forgetMe).
    upcoming(limit = 60) {
      if (!sb()) return Promise.resolve([]);      // the library is not up yet: not an answer to keep
      const k = String(limit);
      let p = upMemo.get(k);
      if (!p) {
        p = OTP.calendar(limit);
        upMemo.set(k, p);
        p.catch(() => { if (upMemo.get(k) === p) upMemo.delete(k); });
      }
      return p.then(rows => rows.slice());
    },

    // Where the desk fixes one date on the board.
    boardDate(id) {
      return UUID_OK.test(String(id == null ? "" : id)) ? "../board/#run:" + id : "../board/#run";
    },

    // ---- THE ROLL (045) ----
    // Call 1: the Roll is members only. post() always says which (members_only),
    // uploadTakePhoto(file, {roll}) keeps Roll photos out of long caches, and
    // this reads the Roll itself.
    async rollFeed(limit = 60, opts) {
      const photos = !(opts && opts.photos === false);
      const c = sb(); if (!c) return [];
      const r = await c.rpc("roll_feed", { p_limit: limit, p_photos: photos });
      if (!r.error) return Array.isArray(r.data) ? r.data : [];
      if (r.error.code !== "PGRST202") throw fail(r.error);
      // No roll_feed yet: the public timeline, which is public anyway.
      const t = await c.rpc("take_feed", { p_limit: limit });
      if (t.error) throw fail(t.error);
      const rows = Array.isArray(t.data) ? t.data : [];
      return photos ? rows.filter(x => x && x.image_url) : rows;
    },

    // ---- PACKS (045) ----
    // Call 16: the cards a member kept (hearts), from packs still up. [] for a
    // stranger or on any error. Never throws.
    async myFaves() {
      const c = sb(); if (!c) return [];
      try {
        if (!(await hasSession(c))) return [];
        const { data, error } = await c.rpc("my_faves");
        return (!error && Array.isArray(data)) ? data : [];
      } catch (e) { return []; }
    },
  };

  // THE MEMBERS MANAGER: the one dispatch table deskHide / deskDelete read. A
  // kind with no hide only comes down (or stays), and says so in the database's
  // own words. Zero rows, or the outcome 'gone', is "already gone".
  const GONE = "That one is already gone.";
  const actOrGone = async (kind, id, how) => {
    const r = await OTP.deskAct(kind, id, how);
    if (r.outcome === "gone") throw new Error(GONE);
    return r;
  };
  const rowsOrGone = n => { if (!n) throw new Error(GONE); return n; };
  const viaAct = kind => ({
    hide: (id, h) => actOrGone(kind, id, h ? "hide" : "unhide"),
    del: id => actOrGone(kind, id, "remove"),
  });
  const DESK_KINDS = {
    post: viaAct("post"),
    take_comment: viaAct("take_comment"),
    flyer_comment: viaAct("flyer_comment"),
    pack: viaAct("pack"),
    room: viaAct("room"),
    space_post: { del: id => actOrGone("space_post", id, "remove"), only: "A page comment comes down or stays." },
    frame_tag: {
      del: async (id, x) => {
        if (!x.user || !x.slug || !x.media) throw new Error("Say whose tag, on which photo.");
        return await OTP.deskUntagFrame(x.user, x.slug, x.media);
      },
      only: "A tag comes off or stays.",
    },
    story: {
      hide: async (id, h) => rowsOrGone(await OTP.setStoryPublished(id, !h)),
      del: async id => rowsOrGone(await OTP.deleteStory(id)),
    },
    story_comment: {
      hide: async (id, h) => rowsOrGone(await OTP.setEntryPublished(id, !h)),
      del: async id => rowsOrGone(await OTP.deleteEntry(id)),
    },
    pick: {
      hide: async (id, h) => rowsOrGone(await OTP.setTrackPublished(id, !h)),
      del: async id => rowsOrGone(await OTP.deleteTrack(id)),
    },
    video: {
      hide: async (id, h) => rowsOrGone(await OTP.setVideoPublished(id, !h)),
      del: async id => rowsOrGone(await dropVideo(id)),
    },
    date: {
      hide: async (id, h) => rowsOrGone(await OTP.setDatePublished(id, !h)),
      del: async id => rowsOrGone(await dropDate(id)),
    },
    dm_message: { del: id => OTP.deskRemoveMessage(id), only: "A message comes down or stays." },
    space: {
      del: async (id, x) => {
        if (!x.user) throw new Error("Say whose page.");
        const r = await OTP.clearSpace(x.user, "page");
        if (r.cleared == null) throw new Error(GONE);
        return r;
      },
      only: "A page gets reset or stays. One picture at a time is on the members list.",
    },
  };

  w.OTP = OTP;
})(window);
