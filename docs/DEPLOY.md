# Hosting the school on your own AWS account

This puts the school at **https://lms.brianjeanbuilds.com** (or any name in a
Route 53 zone you own), with a branded welcome page and family sign-in in front
of everything, and the AI teachers served
from your account. After the one-time setup, every push to `main` on GitHub
deploys automatically.

```
Browser ──HTTPS──▶ CloudFront (lms.brianjeanbuilds.com)
                    │  signed out → branded welcome page + family sign-in (public/welcome)
                    │  signed in  → session cookie checked at the edge (CloudFront Function)
                    │               every signed-in device shares one school (family sync)
                    ├─ /*      ─▶ private S3 bucket (the built site)
                    └─ /api/*  ─▶ Lambda: AI helper ─▶ OpenAI (replies, natural voices, listening)
                                   │                   or Anthropic (replies only)
                                   ├─ family sync: records in DynamoDB, photos in S3 (this stack)
                                   ├─ reads the OpenAI key from AWS Secrets Manager (never copied)
                                   └─ answers only requests that came through CloudFront
GitHub push to main ─▶ Actions: typecheck · lint · tests · build ─▶ S3 + Lambda + cache refresh
```

Everything is one CloudFormation stack: [`infra/aws/stack.yaml`](../infra/aws/stack.yaml).

## What it costs

| Piece | Monthly cost for a family |
| --- | --- |
| CloudFront (HTTPS, CDN, sign-in function) | $0 — well inside AWS's always-free CloudFront allowance (1 TB, 10 million requests) |
| S3 (≈3 MB of site files) | under $0.01 |
| Lambda (AI helper) | $0 — inside the Lambda free tier |
| HTTPS certificate (ACM) | $0 |
| Route 53 | the $0.50 you already pay for the brianjeanbuilds.com zone |
| Family sync (DynamoDB on-demand + S3) | a few cents: a family's school is a few MB, and each sync is a handful of tiny reads and writes |
| AI teacher replies | OpenAI `gpt-6-luna`: a few hundredths of a cent per reply. (Anthropic Claude Haiku 4.5: about 0.2¢.) |
| Natural teacher voices | OpenAI `gpt-4o-mini-tts`: about 1.5¢ per minute of speech. Lines are saved in the browser, so repeated lines are free. |
| Listening | OpenAI `gpt-transcribe`: about 0.45¢ per minute of her talking (about 0.1¢ per sentence). |
| The OpenAI key in Secrets Manager | $0.40 a month for the secret (the helper reads it about once an hour) |

Tip: set a monthly budget on the OpenAI project that owns the key
(platform.openai.com → Settings → Limits). The helper also caps use per day:
300 replies (`AiDailyLimit`), 1,500 spoken lines and 500 recordings.

## One-time setup (on your Mac, ~20 minutes, mostly waiting)

1. **Tools and sign-in.** Install the AWS CLI (and the GitHub CLI, so the script can
   turn on automatic deploys for you), then sign in through IAM Identity Center:

   ```bash
   brew install awscli gh
   gh auth login                                   # once, for GitHub
   aws sso login --profile bullybearai-prod        # browser sign-in
   aws sts get-caller-identity --profile bullybearai-prod >/dev/null && echo "AWS: signed in"
   ```

   Use the profile for the AWS account that holds the `brianjeanbuilds.com` Route 53
   zone (zones are global, so the region doesn't matter — the account does). Any
   profile works — pass it as `AWS_PROFILE`. The stack always goes to
   **us-east-1** (CloudFront only takes certificates from there), whatever the
   profile's default region; it's a separate stack (`virtual-school`) and doesn't
   touch any other stacks in the account. It does add two records to the
   `brianjeanbuilds.com` hosted zone (the `lms` alias and the certificate check),
   so if that zone is covered by a deployment lock in another repo, take the lock
   first.

2. **Code on GitHub.** From the project folder:

   ```bash
   cd ~/Projects/izzys-classroom
   git add -A
   git commit -m "Talk to teachers + AWS hosting"
   git remote add origin https://github.com/jeanbrianc/virtual-school.git   # skip if already added
   git push -u origin main
   ```

   The first run of GitHub Actions only checks the code (typecheck, lint, tests); it
   deploys once step 4 is done.

3. **Create the site.**

   ```bash
   AWS_PROFILE=bullybearai-prod npm run deploy:aws
   ```

   It finds the `brianjeanbuilds.com` hosted zone, asks for a **site username and
   password** (only a hash is stored in AWS) and your **Anthropic API key** (press
   Enter to leave AI teachers off), creates the stack in `us-east-1` — the certificate
   and CloudFront take 5–15 minutes the first time — then builds and uploads the site
   and the AI helper.

4. **Turn on automatic deploys.** With the GitHub CLI signed in, the script offers to
   do it: it saves the deploy role as the repository **secret** `AWS_DEPLOY_ROLE_ARN`
   (a secret, so your account ID never appears in this public repo's logs) and sets
   the variable `AWS_DEPLOY_ENABLED=true`. Without `gh` it prints both for you to add
   under *Settings → Secrets and variables → Actions*. No AWS keys are stored in
   GitHub: Actions signs in with OpenID Connect to a role that can only upload this
   site, update this Lambda and refresh this CloudFront distribution — and only for
   pushes to `main` of this repository.

5. **Open https://lms.brianjeanbuilds.com**: the welcome page shows Izzy's classroom and a
   *Family sign-in* card. Sign in once per device (it stays signed in for 60 days) and set up the
   school like on your Mac. To use the AI teachers there: *Grown-ups → Settings & privacy
   → AI teachers* → **Check connection** → tick consent → **Turn on AI teachers** (the
   helper address is already `/api`).

## OpenAI: better replies, natural voices and listening

With an OpenAI key the helper does three things, and each has its own switch in
*Grown-ups → Settings & privacy*:

| Switch | What it does | What goes to OpenAI |
| --- | --- | --- |
| *AI teachers* (consent + **Turn on**) | Replies to anything she says (`gpt-6-luna`) | Her first name, her words (as text), the last few lines, her book titles |
| *Voice → Natural teacher voices* | Hoot, Digit and Nova each speak with their own natural voice (`gpt-4o-mini-tts`) | The words each teacher says (which include her name and their answers to her) |
| *Talking to teachers → Your AI helper (OpenAI)* | Turns her speech into words, much more accurately than the browser (`gpt-transcribe`) | Her recording — only while the microphone button is on — plus her first name and book titles as spelling hints |

**Set it up** (the key is already in Secrets Manager):

```bash
cd ~/Projects/izzys-classroom
aws sso login --profile bullybearai-prod
AWS_PROFILE=bullybearai-prod npm run deploy:aws -- --openai-secret 'arn:aws:secretsmanager:us-east-2:<account>:secret:openai/api-key-XXXXXX'
```

The script checks the secret exists in the same AWS account (metadata only — it
never reads the key), then gives the AI helper's role permission to **read that one
secret** (`secretsmanager:GetSecretValue` on its ARN, plus `kms:Decrypt` if the
secret uses your own KMS key). The Lambda fetches the key when it first needs it
and keeps it in memory for up to an hour, so a rotated key is picked up without a
redeploy. The ARN is kept as a hidden stack parameter — not in GitHub. The secret
can be a plain `sk-…` string or JSON such as `{"OPENAI_API_KEY": "sk-…"}`.

Then open the site → *Grown-ups → Settings & privacy* → *AI teachers* → **Check
connection** ("Connected — AI teachers are using OpenAI…"), and turn on whichever of
the three you want. Each browser keeps its own settings. This checks configuration,
not a successful provider request. Under *Voice*, use **Test natural voice** to
generate a short sample without child information (a small API-credit cost), then
press play to confirm sound on the device. This does not test microphone transcription.

If speech fails, the helper classifies known quota/credit and temporary rate-limit
errors, without exposing provider bodies or child text. Known quota failures pause
provider voice calls for 15 minutes; transient/unknown 429 failures honor bounded
`Retry-After` (1–900 seconds, default 60). The browser also pauses failed voice calls
and uses built-in read-aloud. Helper cooldowns apply to each warm Lambda instance,
not globally across instances. They do not change the existing daily caps or billing.
The explicit parent test may be retried, but the warm helper cooldown still applies.

**Children's privacy — please read.** OpenAI's guidance for apps used by
children says: *"You should not use OpenAI services to process any personal data
of children under 13 … without first implementing zero data retention in our
API."* Zero data retention needs OpenAI's approval (contact their sales team).
Today:

- **Listening** — OpenAI keeps no copy of audio sent for transcription.
- **Replies and natural voices** — kept up to 30 days for abuse monitoring unless
  your OpenAI organization has zero data retention. Not used for training. Replies
  are sent with `store: false`.

OpenAI also asks that people are told when a voice is AI-generated — Settings says
so next to the switch. **Turn OpenAI off again:** `npm run deploy:aws -- --openai-secret none`
(the secret itself is left alone).

## Family sync — the same school on every device

Without it, each browser has its own school: the Mac has Izzy's history, and a phone or
iPad starts empty. With it, every device you sign in on shares one school.

1. **On the device that has her history** (your Mac's Chrome): *Grown-ups → Settings &
   privacy → Family sync* → **Turn on family sync**. It saves the whole school — books,
   reading, progress, conversations, photos and settings (the parent PIN too).
2. **On the phone, the iPad, anything else:** sign in at lms.brianjeanbuilds.com. A device
   that hasn't been used yet takes the family's school automatically before it opens.
   A device that already has records of its own asks first (*Use the family's school
   here* or *Make this device's school the family's*).
3. **After that:** changes go out a few seconds after they happen and arrive on the other
   devices when they open, come back to the front, or within about 45 seconds. If two
   devices change the same thing, the newer change wins. Each device still works
   offline and catches up later. *Stop syncing on this device* pauses one device.

**Where it's kept:** in this stack — a DynamoDB table (`FamilyRecordsTable`, on-demand,
point-in-time recovery for 35 days) for records, and a private, versioned S3 bucket
(`FamilyMediaBucket`) for photos. Both are kept even if the stack is deleted. Only the AI
helper Lambda can read or write them (no deletes, no scans), and only through the
family sign-in; GitHub deploys can't touch them. Cost for a family: pennies a month.

*Start fresh* and *Load sample data* change the school on **every** device while sync is
on (Settings says so before you confirm).

## Everyday

- **Change something → push to `main`.** Actions checks and deploys in a few minutes.
- **Change the site password:** `AWS_PROFILE=bullybearai-prod npm run deploy:aws -- --password` (this also signs every device out)
- **Sign a device out:** *Grown-ups → Settings & privacy → This device → Sign out*
- **Use an OpenAI key from Secrets Manager:** `AWS_PROFILE=bullybearai-prod npm run deploy:aws -- --openai-secret <secret ARN>` (see above)
- **Rotate the OpenAI key:** put the new value in the same secret; the helper uses it within an hour.
- **Add or change an Anthropic key (replies only):** `AWS_PROFILE=bullybearai-prod npm run deploy:aws -- --api-key`
- **Change the stack itself** (edited `infra/aws/stack.yaml`): `AWS_PROFILE=bullybearai-prod npm run deploy:aws`
- **Signed out?** `aws sso login --profile bullybearai-prod`, then re-run.

## Good to know

- **Family sync: the same school on every device.** Each browser keeps a copy of the
  school (IndexedDB, so it works offline and opens instantly); with family sync on, the
  copies stay the same through your own AWS account. See *Family sync* below. The school
  at `127.0.0.1:5173` on your Mac (local development) is separate and never syncs.
- **How sign-in works.** The welcome page (`public/welcome/`) is the only public part of
  the site. Its form sends the username and password to `/auth/session`; the CloudFront
  Function compares a SHA-256 of them with the stored hash (the password itself is never
  in AWS) and sets a signed, HttpOnly session cookie. There is no browser password pop-up.
  Brute-force attempts aren't rate-limited at the edge, so use a long password.
- **Sign-in covers everything else**, including `/api`, so nobody without it can
  use your API key. The Lambda also refuses any request that didn't come through
  CloudFront (a secret header only CloudFront adds). The parent PIN inside the
  school still guards the Parent Studio.
- **Talking works on the hosted site** (it's HTTPS, and the page allows the
  microphone for itself). Her first tap on the microphone sets it up in that browser.
- **The code on GitHub is public** and includes Izzy's name and birthday in
  `src/data/seed/`. The live school is behind the sign-in; the welcome page shows her
  first name, the teachers and screenshots, and tells search engines not to index it.
- **Search engines are told not to index** the site (`X-Robots-Tag: noindex`).

## Troubleshooting

| What you see | Why / what to do |
| --- | --- |
| `Not signed in for profile …` | SSO sessions expire: `aws sso login --profile bullybearai-prod`, then re-run. |
| `Couldn't find a public Route 53 hosted zone` | The `brianjeanbuilds.com` zone lives in a different AWS account than the profile (regions don't matter for Route 53). Use that account's profile, or delegate `lms.brianjeanbuilds.com` to a zone in this one. |
| `Deploy this stack in us-east-1` | The script already uses us-east-1; if you deploy by hand, add `--region us-east-1`. |
| Stack creation sits on `Certificate` | DNS validation takes a few minutes; it needs the Route 53 zone to be the one the domain actually uses (check the NS records at your registrar). |
| "That username or password didn't work" | Reset it with `--password`. The username is case-sensitive. |
| Still see the old browser pop-up | The stack hasn't been updated yet — run `npm run deploy:aws` once (GitHub pushes don't change the stack). |
| AI teachers: "has no API key yet" | Run `npm run deploy:aws -- --openai-secret <ARN>` (or `-- --api-key` for Anthropic). If you already did, the Lambda can't read the secret: see its log (CloudWatch → `/aws/lambda/virtual-school-ai-helper`) for `Secrets Manager refused (…)` — usually a customer-managed KMS key or a secret in another account. |
| `That secret belongs to a different AWS account` | The secret must be in the account that holds the site (the `bullybearai-prod` profile's). Create it there, or share it with a resource policy (not covered here). |
| The phone or iPad still starts empty | Family sync isn't on yet: turn it on in *Settings → Family sync* **on the Mac** first, then reload the other device. If Settings says "needs one more step", the stack hasn't been updated — run `npm run deploy:aws` once. |
| "This device has records of its own too" | That device was used before sync. *Use the family's school here* replaces its records with the family's; *Make this device's school the family's* does the opposite (for every device). |
| The microphone connects to your iPhone, then "I didn't hear anything" | macOS was offering the iPhone (Continuity) as the default microphone. The school now skips an iPhone/iPad mic and listens with the Mac's built-in one; to pick another, use *Settings → Talking to teachers → Microphone* and **Test the microphone** (the bar should move when you talk). To stop the Mac reaching for the phone everywhere: Mac *System Settings → Sound → Input → MacBook Pro Microphone*, or iPhone *Settings → General → AirPlay & Continuity → Continuity Camera* off. |
| Natural voices sound like the computer's voice | Built-in read-aloud is the fallback. *Check connection* confirms configuration; use *Voice → Test natural voice* for a real provider request. Known quota failures require checking the OpenAI project's credit, billing/budget, and model limits; transient rate limits require waiting. Unknown 429 remains unclassified. Never paste keys or raw provider responses into issues. |
| AI teachers: "not been uploaded yet" | The Lambda still has the placeholder; run `npm run deploy:aws` (or push to `main`). |
| Actions deploy step skipped | Set the secret `AWS_DEPLOY_ROLE_ARN` and the variable `AWS_DEPLOY_ENABLED=true` (step 4). |

**Removing everything:** empty the bucket (`aws s3 rm s3://<BucketName> --recursive`
and delete old versions in the console), then
`aws cloudformation delete-stack --stack-name virtual-school --region us-east-1 --profile bullybearai-prod`.
