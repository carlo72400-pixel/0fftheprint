-- ============================================================
-- ONE PROFILE MERGE (his call 2). Written by oneprofile_seeds.py from content/roster.json. Paste after 043, 044, 045.
-- Run STEP 1, read every row, then STEP 2. Rerun oneprofile_seeds.py after any bake.py roster fold.
-- ============================================================
-- only these cards' Crypt pic and song move: vamppsych.
-- The house seed songs and Instagram links below go to every card that has none, either way.
-- STEP 1 writes nothing: one row per change STEP 2 would make (card, what, now, Crypt, seed, after).
-- STEP 2 makes them and answers how many cards took their Crypt pic or song. A second STEP 2 answers 0.

-- STEP 1
select * from public.face_plan('{"songs":{"josh-fuego":["1X9fSsWevINdy5iYyN2IpQ",0]},"links":{"virgosgateway":[{"p":"instagram","h":"virgosgateway"}],"wrathfol":[{"p":"instagram","h":"wrathfol"}],"kurlytop":[{"p":"instagram","h":"kurlytop"}],"wunmor":[{"p":"instagram","h":"wunmorwin"}],"josh-fuego":[{"p":"instagram","h":"joshdelfuego"}],"vamppsych":[{"p":"instagram","h":"vamppsych"}]},"only":["vamppsych"]}'::jsonb);

-- STEP 2
select public.face_merge('{"songs":{"josh-fuego":["1X9fSsWevINdy5iYyN2IpQ",0]},"links":{"virgosgateway":[{"p":"instagram","h":"virgosgateway"}],"wrathfol":[{"p":"instagram","h":"wrathfol"}],"kurlytop":[{"p":"instagram","h":"kurlytop"}],"wunmor":[{"p":"instagram","h":"wunmorwin"}],"josh-fuego":[{"p":"instagram","h":"joshdelfuego"}],"vamppsych":[{"p":"instagram","h":"vamppsych"}]},"only":["vamppsych"]}'::jsonb);
