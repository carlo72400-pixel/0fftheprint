# THE TAKE: logins, the Crypt and card holders

Everybody joins in the Crypt, you hand out cards by hand, they post. Everything below is
already built into the site. You do a few things once, then it runs itself.

**Cost: $0.** Supabase's free tier covers 50,000 monthly active users, a 500MB
database and 1GB of image storage. This roster will use a rounding error of that.

---

## What you have to do (about 10 minutes, once)

### 1. Make the project

1. Go to **supabase.com**, sign up (free), click **New project**.
2. Name it `0fftheprint`. Pick a region near Texas (`us-east-1` is fine).
3. It gives you a database password. **Save it in your password manager. You will
   not need it for this site.** The site never sees it.
4. Wait about a minute for it to finish building.

### 2. Run the SQL

Open **SQL Editor** in the left sidebar, paste everything in `schema.sql`
(next to this file), hit **Run**. That creates the tables, the approval gate, and
the image bucket in one shot. The `migration-0NN-*.sql` files are how the live
project grew after that; each one says at the top when to paste it.

### 3. Paste your two keys

In Supabase go to **Project Settings, API** and copy:

- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon / public** key (a long string starting `eyJ...`)

Open `supabase-config.js` in this folder and paste them in. Commit and push.

> **The anon key is safe to publish.** It is designed to sit in public web pages.
> Every table has Row Level Security turned on, so that key can only do what the
> rules allow: read published posts, and write what each person is allowed to.
>
> **The `service_role` key is the dangerous one. Never put it in this repo, never
> paste it in a chat, never put it in the site.** It ignores all security rules.
> You will not need it.

### 4. Three switches in Authentication

All three live under **Authentication** in the Supabase dashboard.

- **Confirm email: OFF** (Sign In / Providers, Email). Nobody waits on a mail to
  get in; the Crypt's Instagram step and your hand on the cards are the real gates.
  It also means **an email change on Your account applies at once**: the new
  address is the login from that moment, with no link to click.
- **Secure password change: ON** (Sign In / Providers, Email). A password change
  then needs a recent login. Your account (`/my/`) asks for the password again and
  logs them in fresh right before it changes anything, so members never see this.
  The same fresh login guards the email change and closing an account.
- **URL Configuration.** The redirect allowlist has to carry
  `https://0fftheprint.com/**`. The reset mail lands on
  `https://0fftheprint.com/reset/`, and an email change that does need a link
  lands on `https://0fftheprint.com/my/#account`. A link to an address that is not
  on the list goes to the Site URL instead.

---

## Making yourself the boss

Join in the Crypt first (`/wall/`), with your own email. Then in Supabase go to
**Table Editor, profiles**, find your row, and tick **is_admin** and
**approved**. That is the only thing you ever have to do by hand.

From then on you run everything from **`/board/`** on your own site (`/desk/`
just sends you there).

**Your own email changes only in the Supabase dashboard** (Authentication, Users,
your row). Your account hides the email form for the desk on purpose, so a
stolen desk login can never move the house's login somewhere else.

---

## How it works day to day

| Who | Where | What happens |
|---|---|---|
| Anybody new | the Crypt (`/wall/`) | Signs up with email, password and their Instagram, one account each. They can post the same day. |
| A member who wants a card | the Crypt, under Kin | Asks for one (and picks their roster seat if they already have one) |
| You | `/board/` | See who is asking, make them a card holder or say no |
| Everybody | `/join/` | Logs in, or asks for a password reset. **Log in and reset only**: there is no sign-up here any more, and an old sign-up link says so. |
| Everybody | `/my/` (Your account) | Changes their name (card holders ask you), email and password, logs out everywhere, closes the account (and opens it again) |
| Members and card holders | Home (`/#take`) and `/compose/` | Post (the Take is for everyone, the Roll on the Coven tab is members only), and see their own posts |
| Card holders | `/card/` | Build the card |
| You | `/board/` | Pull any post, ban or close somebody, fix their info |

Nobody can post until they are in. That is enforced in the database itself,
not in the page, so it holds even if somebody messes with the site in their browser.

## If you never set it up

The site keeps working exactly as it does now. The feed falls back to the posts in
`content/take.json` and `post.py` still works. Nothing breaks while this sits unconfigured.
