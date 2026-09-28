# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-09-28

> Auto-drafted from the codebase and the 2026-09-28 brand/UX-copy review, then synced with the copy pass shipped in v2.3.0. Items marked **[assumed]** are inferences — confirm or correct.

## Product Overview
**One-liner:** Know what you can pour tonight, from the bottles you already own. (Exact shipped hero, meta and manifest text; keep them in sync.)
**What it does:** Mixology Vault is an installable web app (PWA) with 99 cocktails and 12 mocktails. You mark which ingredients are in your bar, and it shows what you can make now and what you're one bottle away from. Can't decide? Pick a mood, spirit, sweetness and time of day for three suggestions (morning picks are zero-proof), or snap a photo of your shelf and Claude identifies the bottles. Favourites are saved on your device.
**Product category:** Cocktail recipe app / home bar inventory app ("what can I make with what I have").
**Product type:** Free, static Progressive Web App (GitHub Pages + a Vercel serverless proxy for photo analysis). No account, no login; data stays on-device (localStorage).
**Business model:** Free personal project; no monetisation **[assumed]**. Photo analysis costs Anthropic API spend, capped by rate limits.

## Target Audience
**Target users:** Home cocktail enthusiasts with a small-to-medium home bar (roughly 5–30 bottles) **[assumed]**; hosts entertaining friends; non-drinkers and designated drivers (mocktails).
**Decision-makers:** The individual user (B2C).
**Primary use case:** "I have some bottles — what can I actually make tonight?"
**Jobs to be done:**
- Turn the bottles I already own into a drink tonight, without a shopping trip.
- Help me decide when I don't know what I'm in the mood for.
- Tell me which one bottle to buy next to unlock the most drinks.
**Use cases:**
- Friday evening: open the app, tap "What should I drink right now?", set the mood, get three to try.
- Hosting: check "Ready to make" so you only offer drinks you can actually serve.
- Coming back: tap the Favourites count on Home to see saved drinks.
- Shopping: check "Best next buys" before visiting the liquor store.
- Standing at the shelf: snap a photo instead of ticking off bottles by hand.
- A guest isn't drinking: switch to Mocktails.

## Personas
B2C — single user. Informal segments:

| Segment | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Curious home mixer | Trying new drinks, getting better | Recipe sites assume a fully stocked bar | Only shows what you can make — plus what's close |
| Casual host | Looking good in front of guests, zero stress | Decision paralysis; missing ingredients mid-pour | A confident pick in seconds, with a clear recipe |
| Zero-proof drinker | Something better than soda | Mocktails are an afterthought in most apps | A dedicated, equally crafted mocktail section |

## Problems & Pain Points
**Core problem:** Recipe apps and sites show thousands of drinks, most of which need ingredients you don't have.
**Why alternatives fall short:**
- Recipe sites/blogs: ad-heavy, no inventory awareness, scrolling past life stories.
- Inventory apps: tedious data entry, often require accounts or subscriptions.
- Asking a chatbot: inconsistent recipes, no memory of your bar, no curated collection.
**What it costs them:** Wasted evenings scrolling, half-bottles gathering dust, unnecessary purchases, mediocre "vodka + whatever" drinks.
**Emotional tension:** "I spent money on these bottles and still don't know what to make." Plus the fear of getting it wrong in front of guests.

## Competitive Landscape
**Direct:** Mixel, Cocktail Party, Highball, Difford's Guide app **[assumed — verify]**. They fall short because they're heavier, often need an account or subscription, and inventory entry is manual.
**Secondary:** General recipe sites (Liquor.com, Difford's Guide web). They fall short because they don't know what's in your bar.
**Indirect:** Asking ChatGPT/Claude directly, bartender friends, or just pouring a spirit and mixer. These fall short because there's no persistence, no curation, and they're inconsistent.

## Differentiation
**Key differentiators:**
- Recipes are filtered by your own bar: "Ready to make" vs "Almost there", with % match and the missing ingredients named.
- Photo shelf scan: point your camera, and Claude identifies your bottles.
- "Best next buys": tells you which ingredient unlocks the most new cocktails.
- Mocktails get their own section with equal care.
- No account, no ads, works offline, installs to your home screen, private by default.
**How we do it differently:** A curated library of about 100 drinks with history and method, instead of an endless database, scored against your inventory.
**Why that's better:** Less choice paralysis, and every suggestion is actually makeable.
**Why customers choose us:** Fast, private, free, and good-looking. It feels like a speakeasy menu, not a database **[assumed]**.

## Objections
| Objection | Response |
|-----------|----------|
| "Entering my bar is tedious." | Tap a pill to toggle it, or snap a photo and let Claude fill it in. |
| "Where does my photo go?" | It's sent to Anthropic's Claude only to identify bottles (stated in-app under the camera). No account and no photo library. Don't claim "never stored" until retention is confirmed. |
| "Only ~100 cocktails?" | Curated on purpose: classics plus signatures, each with history and method. Quality over volume. |
| "Is this just another recipe site?" | No. It tells you what you can make right now, and what to buy next. |

**Anti-persona:** Professional bartenders who need batch or costing tools; people who want thousands of obscure recipes; anyone under legal drinking age.

## Switching Dynamics
**Push:** Recipe sites ignore what's in your bar; ads and bloat; accounts and paywalls.
**Pull:** "What can I make?" answered instantly; photo scan; next-bottle advice; no signup.
**Habit:** Googling "gin cocktails"; making the same two drinks; asking an AI chatbot.
**Anxiety:** Setup effort; photo privacy; whether the recipes are any good.

## Customer Language
**How they describe the problem:**
- "What can I make with what I have?" **[assumed — capture real phrasing]**
- "What should I drink right now?" (the app's own hook)
**How they describe us:**
- *No verbatim quotes collected yet.* Add real user feedback here.
**Words to use:** pour, serve, mix, within reach, ready to make, almost there, your bar, tonight, zero-proof, signature, classic.
**Words to avoid:** generate (sounds robotic), configured, error codes, "easy" (sounds condescending), "cheap", "booze", "get drunk", any language encouraging excess or morning drinking.
**Glossary:**
| Term | Meaning |
|------|---------|
| Vault | The brand and app name only ("Mixology Vault"), not a screen |
| My bar | The screen/tab for your ingredients (was "My Vault") |
| In my bar | The toggle view listing your ingredients (was "My shelf") |
| In your bar | Home stat: count of in-stock ingredients |
| In stock / Missing | Ingredient status (replaces Available/Have and Need/Needed) |
| Ready to make | 100% of ingredients in stock |
| Almost there | Partial match; shows missing items |
| Best next buys | Ingredients that unlock the most new cocktails |
| Signature | Featured house cocktails (tagged in data) |
| Tonight's pick | Random featured cocktail on Home |
| Zero-proof | Non-alcoholic (Mocktails) |
| Decide | Tab for mood- or photo-based suggestions |
| Three to try | The three Decide results |
| Spotted in your photo | Ingredients identified by the photo scan |
| Quick / Moderate / Advanced | Difficulty, by ingredient count ("Medium" is only a sweetness level) |

## Brand Voice
**Tone:** Warm, confident and a little indulgent, like a good bartender who knows your name. Celebratory on success, calm and helpful on errors, never preachy.
**Style:** Short, conversational, sentence case for every UI label, heading and button. Buttons start with a verb ("Find my drinks", "Identify my bottles"). British spelling (favourite, analyse, cosy). Em dashes with spaces. Emoji only as icons, never mid-sentence. At most one exclamation mark, and rarely.
**Personality:** Refined, welcoming, knowledgeable, playful, discreet.
**Visual cues:** Near-black background (#090909), Playfair Display serif italics for headlines ("Mixology *Vault*"), DM Sans for UI.
- **We sound like:** "Three drinks within reach tonight."
- **We don't sound like:** "Generate My Drinks" / "Error 503: Server not configured."
- **Errors:** say what happened and what to do next, with no status codes or vendor messages. E.g. "We couldn't reach the photo service. Check your connection and try again, or use By mood."

## Proof Points
**Metrics:** 99 cocktails (23 Signature, 31 Classic), 12 mocktails, 32 tracked ingredients; works offline; no account.
**Customers:** None cited yet.
**Testimonials:**
> *None collected yet.*
**Value themes:**
| Theme | Proof |
|-------|-------|
| Make what you have | Ready to make / Almost there scoring with % match |
| Decide faster | Home CTA, Tonight's pick, mood/sweetness/time-of-day ranking, photo scan |
| Private and lightweight | No account; data in localStorage; strict CSP; API key server-side |
| Crafted, not crowded | Curated library with history and method for every drink |

## Compliance Notes
- ✅ "Please drink responsibly" is in the Home footer.
- ✅ Morning Decide picks are zero-proof only.
- ✅ Photo disclosure under the camera: "Your photo is sent to Anthropic's Claude only to identify bottles."
- ✅ "Claude" is used descriptively only; the button says "Identify my bottles".
- ⬜ **Open:** age confirmation (18+/21+) before first use. Needed for app-store listings and some markets.
- ⬜ **Open:** confirm photo retention on the proxy/Anthropic side before promising "not stored".

## Goals
**Business goal:** **[assumed]** Personal/portfolio project that grows repeat home use and installs.
**Conversion action:** Install to home screen, mark at least 5 ingredients, and open a recipe.
**Current metrics:** No analytics installed.

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-09-28) — Synced with the v2.3.0 copy pass: glossary now matches the shipped UI (My bar / In my bar / In your bar, Quick/Moderate/Advanced), Decide now uses mood/sweetness/time, favourites persist; added error-copy rule; compliance items marked done or open.
- v1 (2026-09-28) — Initial context, auto-drafted from the codebase and the brand/UX-copy review.
