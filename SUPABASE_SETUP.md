# THE TAKE — card holder logins

Card holders sign up, you approve them, they post. Everything below is already
built into the site. You do three things once, then it runs itself.

**Cost: $0.** Supabase's free tier covers 50,000 monthly active users, a 500MB
database and 1GB of image storage. This roster will use a rounding error of that.

---

## What you have to do (about 10 minutes, once)

### 1. Make the project

1. Go to **supabase.com**, sign up (free), click **New project**.
2. Name it `0fftheprint`. Pick a region near Texas (`us-east-1` is fine).
3. It gives you a database password. **Save it in your password manager. You will
   not need it for this site** — the site never sees it.
4. Wait about a minute for it to finish building.

### 2. Run the SQL

Open **SQL Editor** in the left sidebar, paste everything in `schema.sql`
(next to this file), hit **Run**. That creates the tables, the approval gate,
and the image bucket in one shot.

### 3. Paste your two keys

In Supabase go to **Project Settings → API** and copy:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon / public** key (a long string starting `eyJ...`)

Open `supabase-config.js` in this folder and paste them in. Commit and push.

> **The anon key is safe to publish.** It is designed to sit in public web pages.
> Every table has Row Level Security turned on, so that key can only do what the
> rules allow: read published posts, and write posts if you approved that person.
>
> **The `service_role` key is the dangerous one. Never put it in this repo, never
> paste it in a chat, never put it in the site.** It ignores all security rules.
> You will not need it.

---

## Making yourself the boss

Sign up at `/join/` first, with your own email. Then in Supabase go to
**Table Editor → profiles**, find your row, and tick **is_admin** and
**approved**. That is the only thing you ever have to do by hand.

From then on you approve people at **`/desk/`** on your own site.

---

## How it works day to day

| Who | Where | What happens |
|---|---|---|
| A card holder | `/join/` | Signs up with email + password, picks their card |
| You | `/desk/` | See who is waiting, hit Approve or Deny |
| Them | `/compose/` | Write a post, attach a photo, it goes live instantly |
| You | `/desk/` | Can pull any post down, or revoke somebody |

Nobody can post until you approve them. That is enforced in the database itself,
not in the page, so it holds even if somebody messes with the site in their browser.

## If you never set it up

The site keeps working exactly as it does now. The feed falls back to the posts in
`content/take.json` and `post.py` still works. Nothing breaks while this sits unconfigured.
