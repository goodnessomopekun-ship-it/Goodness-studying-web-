# Goodness Studying Web

Accounts, lessons, quizzes, certificates and a public verify page. No build step.

## Put it online (about 15 minutes, easiest on a computer)
1. **Supabase** (supabase.com, free): New project. Open SQL Editor, paste all of `schema.sql`, click Run.
2. In Supabase go to Project Settings > API. Copy the Project URL and the anon public key into `config.js`.
3. Optional while testing: Authentication > Providers > Email, turn off "Confirm email".
4. **GitHub** (github.com): create a repository and upload every file in this folder.
5. **Vercel** (vercel.com, free): Add New > Project, import the repository, choose "Other" as the framework, Deploy.
6. Back in Supabase, Authentication > URL Configuration: set Site URL to your Vercel address.

Open your Vercel address, create an account, add a topic, then finish its lessons and questions to earn a certificate.
Anyone can check a certificate number at `/verify.html` without logging in.

## Type a topic, get videos, notes and questions
In Vercel: Project > Settings > Environment Variables, add these four, then Redeploy:
- `YOUTUBE_API_KEY` (Google Cloud, YouTube Data API v3)
- `ANTHROPIC_API_KEY` (console.anthropic.com)
- `SUPABASE_URL` (same as in config.js)
- `SUPABASE_ANON_KEY` (same as in config.js)
