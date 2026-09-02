# The Tally form — build sheet

Five minutes. tally.so, free account, no card. **Standard form, NOT conversational
mode** (his call 2026-07-18): six short fields where you can see the bottom reads
as a 30-second job. One question at a time hides the length, so people don't know
how deep they're going.

**Rewrite any of this copy in your own words.** I guessed at how you talk. You'll
know instantly which lines sound off, and yours will read warmer than mine.

---

## Form title
`Portrait sittings`
(hidden on the page anyway — the embed uses `hideTitle=1`)

## Opening line
> I shoot portraits around San Antonio. It's free. Leave your info and I'll hit you up.

---

## The fields, in order

**1 · Short answer — required**
- Label: `what do people call you`

**2 · Short answer — required**
- Label: `your @`
- Placeholder: `@yourhandle`
- Help text: `IG or TikTok, whichever you actually check`

**3 · File upload — OPTIONAL**
- Label: `throw in a pic`
- Help text: `just so I know who I'm looking for. doesn't have to be good.`
- Allow images only, 1 file
- **Leave this optional.** People skip photo fields because they don't think they
  look good right now, not because of privacy. Optional plus that help text is
  what gets you photos.

**4 · Short answer — optional**
- Label: `where you usually be`
- Placeholder: `1313, house shows, the pearl, wherever`

**5 · Long answer — optional**
- Label: `what are you thinking`
- Placeholder: `a look, a spot you like, or nothing. up to you.`

**6 · Checkbox — REQUIRED**
- Label: `I'm 18 or older`
- This one is not optional and it stays inside the form, not down in the page
  text, so it's answered before anything gets sent.

## Submit button
`send it`

---

## The thank-you screen — don't skip this

Tally's default is "Your response has been recorded," which is a door closing.
This is the last thing they see, so it's worth thirty seconds:

> got it. I'll message you in a day or two about a spot.
> if I'm slow just DM me @vamppsych.

Concrete timing is what makes it feel real instead of a void.

---

## Then send me the form ID

Your embed URL looks like `https://tally.so/embed/wAbC1D`. Send me that ID and I
swap the Instagram button on the page for the form. Two-line change, the slot is
already marked in `index.html`.

## Settings worth turning on
- **Email notifications** on new response, or you won't notice submissions
- **Spam protection** — the URL is public once the flyers are out

---

## Theme it so the embed doesn't look pasted in

Tally form settings → Design. Paste these so the iframe matches the page and the
seam disappears:

| Setting | Value |
|---|---|
| Background | **transparent** (the embed URL already passes `transparentBackground=1`) |
| Text / body colour | `#4b3d49` |
| Accent / button colour | `#c23a5c` |
| Button text | `#ffffff` |
| Input border | `#e8d2e0` |
| Font | Inter if offered, otherwise the closest system sans |
| Alignment | left |

The page already sets `alignLeft=1` and `dynamicHeight=1` on the embed, so the
frame grows to fit all the fields instead of scrolling inside itself. Without
`dynamicHeight` you get a form in a little scroll box, which feels awful on a phone.
