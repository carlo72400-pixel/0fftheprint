// 0FF THE PRINT — backend config. Project: 0fftheprint001 (free tier).
//
// This is the PUBLISHABLE key. Supabase's own dashboard says it plainly:
// "Publishable keys can be safely shared publicly." It belongs in public web
// pages. Row Level Security is what protects the data, not secrecy of this key,
// and every table in schema.sql has RLS on with explicit policies.
//
// NEVER put the sb_secret_... key here, in this repo, or in a chat. It bypasses
// every security rule. Nothing on this site needs it.

window.OTP_SUPABASE = {
  url:     "https://frqpvcpyglhmerwpvosl.supabase.co",
  anonKey: "sb_publishable_bs1xroHqGL9mwuoFmBzmtQ_PYAw-Qcm",
};
