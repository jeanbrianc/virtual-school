# Hosting Virtual Classroom on an AWS account

The deployment script can publish the school on a domain in an authorized
Route 53 zone, with a welcome page, family sign-in and an optional AI helper.
After automatic deployment is explicitly configured, pushes to `main` deploy
through the repository workflow. The examples below use reserved example
domains and placeholders; they do not identify a live household deployment.

```
Browser ──HTTPS──▶ CloudFront (classroom.example.com)
                    │  signed out → branded welcome page + family sign-in (public/welcome)
                    │  signed in  → session cookie checked at the edge (CloudFront Function)
                    │               opt-in family sync shares one school across authorized devices
                    ├─ /*      ─▶ private S3 bucket (the built site)
                    └─ /api/*  ─▶ Lambda: AI helper ─▶ OpenAI (replies, natural voices, listening)
                                   │                   or Anthropic (replies only)
                                   ├─ family sync: records in DynamoDB, photos in S3 (this stack)
                                   ├─ reads the OpenAI key from AWS Secrets Manager at runtime
                                   └─ answers only requests that came through CloudFront
GitHub push to main ─▶ Actions: typecheck · lint · tests · build ─▶ S3 + Lambda + cache refresh
```

Everything is one CloudFormation stack: [`infra/aws/stack.yaml`](../infra/aws/stack.yaml).

## Cost and quota limits

No price estimate or free-tier eligibility is verified by this guide. Review the
selected account, region, provider/model and current pricing before deployment.

| Component | Usage to account for |
| --- | --- |
| CloudFront, S3 and ACM | Requests, transfer, storage and the selected certificate configuration |
| Route 53 | Hosted zone and DNS queries |
| Lambda | Requests and execution time |
| Family sync | DynamoDB reads/writes/storage, S3 media/storage/requests and recovery/version history |
| AI replies, natural voices and listening | Provider/model usage, including retries and uncached requests |
| Secrets Manager | Stored secrets and retrieval requests |

A cached voice line can avoid a new provider request. Cache misses, eviction and
storage failures can require another request; repeated lines are not guaranteed
free. These costs are separate from the tab's observed-usage card.

Review billing and budget controls in the provider project that owns the key;
verify whether each setting alerts or enforces a limit. The helper has **process-local
request throttles**, normally 300 replies (`AiDailyLimit`), 1,500 spoken lines and
500 recordings per UTC day. Counts reset on runtime restart and are independent
across Lambda workers. They are neither a durable household quota nor a dollar
spending cap. Parent Settings shows only this tab’s partial observed usage, with
unknown cost/billing explicitly separated. See [usage and quota design](AI_USAGE_AND_QUOTAS.md).

## One-time setup

Use an authorized account and repository. Replace every `<...>` placeholder
before running a command. `example.com` and `classroom.example.com` are examples,
not usable deployment destinations. In the shell used for every step, set the
actual approved values explicitly:

```bash
export AWS_PROFILE='<aws-profile>'
export DOMAIN='classroom.example.com'       # replace with the approved site domain
export STACK_NAME='<stack-name>'
export HOSTED_ZONE_ID='<hosted-zone-id>'
export GITHUB_REPO='<owner>/<repository>'
export GITHUB_OWNER_ID='<numeric-owner-id>'
export GITHUB_REPO_ID='<numeric-repository-id>'
```

The script retains project-specific defaults in source. Do not rely on them for
a copied deployment. This documentation changes no runtime branding, defaults,
infrastructure or permissions. Review the welcome assets and seed configuration
separately before publishing a new site. The commands below can create resources,
change persistent access and publish files; examples are not authorization to run them.

1. **Tools and sign-in.** Install the AWS CLI (and the GitHub CLI, so the script can
   turn on automatic deploys for you), then sign in through IAM Identity Center:

   ```bash
   brew install awscli gh
   gh auth login                                   # once, for GitHub
   aws sso login --profile "$AWS_PROFILE"        # browser sign-in
   aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null && echo "AWS: signed in"
   ```

   Use the profile for the account holding the approved public hosted zone.
   Route 53 zones are global. The stack deploys to **us-east-1**, where CloudFront
   requires its ACM certificate, regardless of the profile's default region.
   Review the selected stack and DNS changes: deployment adds the site alias and
   certificate-validation record. Follow any existing change/deployment lock.

2. **Code on GitHub.** From the project folder:

   ```bash
   cd '/path/to/virtual-classroom'  # replace with your checkout path
   git add -A
   git commit -m "Talk to teachers + AWS hosting"
   git remote add origin "https://github.com/${GITHUB_REPO}.git"   # skip if already added
   git push -u origin main
   ```

   The first run of GitHub Actions only checks the code (typecheck, lint, tests); it
   deploys once step 4 is done.

3. **Create the site.**

   ```bash
   npm run deploy:aws
   ```

   It uses the selected hosted zone and asks for a **site username and
   password** (only a hash is stored in AWS) and your **Anthropic API key** (press
   Enter to omit Anthropic), creates or updates the stack in `us-east-1` — the certificate
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

   The trust policy uses GitHub's immutable OIDC subject:
   `repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:refs/heads/main`, with audience
   `sts.amazonaws.com`. Set `GITHUB_OWNER_ID` and `GITHUB_REPO_ID` to the chosen
   repository's immutable numeric IDs along with `GITHUB_REPO`; do not copy the
   source defaults to a different repository.
   Get those IDs from the repository metadata through GitHub; they are identifiers,
   not credentials. Do not use wildcard trust or enable pull-request deployment.
   Updating the repository secret alone cannot fix an AWS trust mismatch; deploy
   the updated stack template. This changes the trusted identity, not the deploy
   role's publishing permissions, and creates no additional resources or cost.
   See [GitHub's OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

5. **Open the configured site domain**: the welcome page provides a
   *Family sign-in* card. Sign in once per device (the session lasts 60 days) and
   set up the school. To use the AI teachers there: *Grown-ups → Settings & privacy
   → AI teachers* → **Check connection** → tick consent → **Turn on AI teachers** (the
   helper address is already `/api`).

## Optional OpenAI replies, natural voices and listening

With an OpenAI key the helper does three things, and each has its own switch in
*Grown-ups → Settings & privacy*:

| Switch | What it does | What goes to OpenAI |
| --- | --- | --- |
| *AI teachers* (consent + **Turn on**) | Optional replies for eligible conversation turns (source default `gpt-6-luna`) | Learner first name, current text, up to eight history turns and up to 20 book titles |
| *Voice → Natural teacher voices* | Optional teacher read-aloud (source default `gpt-4o-mini-tts`) | Eligible teacher lines, which may include learner-provided personal information |
| *Talking to teachers → Your AI helper (OpenAI)* | Transcribes a microphone clip (source default `gpt-transcribe`); accuracy is not guaranteed | Temporary audio clip, book-title hints and first name when supplied |

**Configure an existing authorized secret** using the deployment variables above.
Replace the entire example ARN with the approved secret ARN; do not paste a key
into a command or document:

```bash
cd '/path/to/virtual-classroom'  # replace with your checkout path
aws sso login --profile "$AWS_PROFILE"
npm run deploy:aws -- --openai-secret 'arn:aws:secretsmanager:<region>:<account-id>:secret:<secret-name>-<suffix>'
```

The script checks the secret exists in the same AWS account (metadata only — it
never reads the key), then gives the AI helper's role permission to **read that one
secret** (`secretsmanager:GetSecretValue` on its ARN, plus `kms:Decrypt` if the
secret uses your own KMS key). The Lambda fetches the key when it first needs it
and keeps it in memory for up to an hour, so a rotated key is picked up without a
redeploy. The ARN is kept as a hidden stack parameter — not in GitHub. The secret
can be a plain `sk-…` string or JSON such as `{"OPENAI_API_KEY": "sk-…"}`.

Then open the site → *Grown-ups → Settings & privacy* → *AI teachers* → **Check
connection** ("Connected to helper — OpenAI… is configured…"), and turn on whichever of
the three you want after reviewing the data-handling gate below. Saved choices
follow existing household storage/sync. This checks configuration,
not a successful provider request. Under *Voice*, use **Test natural voice** to
generate a short sample without child information (a small API-credit cost), then
press play to confirm sound on the device. This does not test microphone transcription.

If speech fails, the helper classifies known quota/credit and temporary rate-limit
errors, without exposing provider bodies or child text. Known quota failures pause
provider voice calls for 15 minutes; transient/unknown 429 failures honor bounded
`Retry-After` (1–900 seconds, default 60). The browser also pauses failed voice calls
and attempts browser read-aloud. Ordinary browser output can fall back to its
default voice when no listed local voice is available; contained speech is
local-service-only or text-only. Helper cooldowns apply to each warm Lambda instance,
not globally across instances. They do not make the process-local daily throttles durable or cap billing.
The explicit parent test may be retried, but the warm helper cooldown still applies.

### Provider data handling and release limits

Reviewed against official guidance on October 17, 2026; this is not verification
of the deployment's private account controls. OpenAI's
[under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
says to implement API zero data retention before processing personal data below
13 or the applicable digital-consent age. Confirm eligible endpoints and the
approved organization/project configuration before enabling such use.

The [OpenAI data-controls table](https://developers.openai.com/api/docs/guides/your-data)
lists no abuse-monitoring/application-state retention for `/audio/transcriptions`
and 30-day abuse monitoring for `/responses` and `/audio/speech`, subject to
stated exceptions and controls. API data is not used for training by default.
The helper's `store: false` is not proof of approved zero data retention; neither
is endpoint eligibility. These are provider terms, not guarantees established
by local tests or the deployment smoke.

Anthropic's [commercial API retention guidance](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
describes standard deletion within 30 days with contractual, legal and safety
exceptions. Its [training guidance](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
excludes commercial inputs/outputs by default but describes opt-in/feedback
exceptions. Check the selected provider/model and applicable agreement separately.

Helper listening temporarily buffers and transmits microphone audio, with
name/book-title hints when supplied. The app does not persist raw microphone
recordings in learner records. Natural-voice audio is cached separately in the
browser; cache deletion does not delete provider data. Configuration checks do
not test a real provider call, and generated audio does not prove audible
playback. Release verification made no live provider calls and did not establish
retention approval; keep those acceptance gates separate.

OpenAI also asks that people are told when a voice is AI-generated — Settings says
so next to the switch. **Turn OpenAI off again:** `npm run deploy:aws -- --openai-secret none`
(the secret itself is left alone).

## Family sync — the same school on every device

Without sync, each browser keeps separate local records. With sync enabled,
authorized signed-in devices can share one household school.

1. **On the device holding the records to share**: *Grown-ups → Settings &
   privacy → Family sync* → **Turn on family sync**. It saves the whole school — books,
   reading, progress, conversations, photos and settings (the parent PIN too).
2. **On another authorized device:** sign in at the configured site domain. A device
   that hasn't been used yet takes the family's school automatically before it opens.
   A device that already has records of its own asks first (*Use the family's school
   here* or *Make this device's school the family's*).
3. **After that:** changes go out a few seconds after they happen and arrive on the other
   devices when they open, come back to the front, or within about 45 seconds. If two
   devices change the same thing, the newer change wins. Each device still works
   offline and catches up later. *Stop syncing on this device* pauses one device.

On a narrow phone, the school menu appears below the status badges; **Grown-ups**
remains on screen with a minimum 44-pixel touch target. If other devices still
start empty, check **Family sync** on the device holding the history. **Off** means
signing in has not uploaded any progress. Turn it on there and wait for **Last
synced** before reloading the other devices. Do not make an empty phone's school
the family's school over an existing saved history. This layout change adds no
AWS resources or charges and does not automatically upload local records.

**Where it's kept:** in this stack — a DynamoDB table (`FamilyRecordsTable`, on-demand,
point-in-time recovery for 35 days) for records, and a private, versioned S3 bucket
(`FamilyMediaBucket`) for photos. Both are kept even if the stack is deleted. Only the AI
helper Lambda can read or write them (no deletes, no scans), and only through the
family sign-in; GitHub deploys can't touch them. Storage and request costs vary.

*Start fresh* and *Load sample data* change the school on **every** device while sync is
on (Settings says so before you confirm).

## Everyday

- **Change something → push to `main`.** Actions checks and deploys in a few minutes.
- **Change the site password:** `npm run deploy:aws -- --password` (this also signs every device out)
- **Sign a device out:** *Grown-ups → Settings & privacy → This device → Sign out*
- **Use an OpenAI key from Secrets Manager:** `npm run deploy:aws -- --openai-secret "<secret-arn>"` (see above)
- **Rotate the OpenAI key:** put the new value in the same secret; the helper uses it within an hour.
- **Add or change an Anthropic key (replies only):** `npm run deploy:aws -- --api-key`
- **Change the stack itself** (edited `infra/aws/stack.yaml`): `npm run deploy:aws`
- **Signed out?** `aws sso login --profile "$AWS_PROFILE"`, then re-run.

## Good to know

- **Family sync: the same school on every device.** Each browser keeps a copy of the
  school (IndexedDB, so it works offline and opens instantly); with family sync on, the
  copies stay the same through your own AWS account. See [Family sync](#family-sync--the-same-school-on-every-device). The school
  at `127.0.0.1:5173` (local development) is separate and does not use hosted sync.
- **How sign-in works.** The welcome page (`public/welcome/`) is the only public part of
  the site. Its form sends the username and password to `/auth/session`; the CloudFront
  Function processes those credentials over HTTPS and compares their SHA-256 with
  the stored hash verifier. The deployment stores the verifier rather than a plaintext
  password; AWS still receives and processes credentials during sign-in. A successful
  match sets a signed, HttpOnly session cookie. There is no browser password pop-up.
  Brute-force attempts aren't rate-limited at the edge, so use a long password.
- **Sign-in covers everything else**, including `/api`, so nobody without it can
  use your API key. The Lambda also refuses any request that didn't come through
  CloudFront (a secret header only CloudFront adds). The parent PIN inside the
  school still guards the Parent Studio.
- **Talking works on the hosted site** (it's HTTPS, and the page allows the
  microphone for itself), subject to browser support and permission. The first
  microphone tap initiates the configured listening flow.
- **Public source and welcome assets need a separate privacy review.** Sign-in
  does not hide a public repository or the welcome page. Review `src/data/seed/`
  and `public/welcome/` before reusing or publishing the application. This docs-only
  sanitization does not alter their profile defaults, branding or screenshots.
- **Search engines are told not to index** the site (`X-Robots-Tag: noindex`).

## Troubleshooting

| What you see | Why / what to do |
| --- | --- |
| `Not signed in for profile …` | SSO sessions expire: `aws sso login --profile "$AWS_PROFILE"`, then re-run. |
| `Couldn't find a public Route 53 hosted zone` | Verify the approved domain, `HOSTED_ZONE_ID` and account profile. Route 53 zones are global; use the account that owns the public zone. Any DNS delegation change requires separate review. |
| `Deploy this stack in us-east-1` | The script already uses us-east-1; if you deploy by hand, add `--region us-east-1`. |
| Stack creation sits on `Certificate` | DNS validation takes a few minutes; it needs the Route 53 zone to be the one the domain actually uses (check the NS records at your registrar). |
| "That username or password didn't work" | Reset it with `--password`. The username is case-sensitive. |
| Still see the old browser pop-up | The stack hasn't been updated yet — run `npm run deploy:aws` once (GitHub pushes don't change the stack). |
| AI teachers: "has no API key yet" | Run `npm run deploy:aws -- --openai-secret "<secret-arn>"` (or `-- --api-key` for Anthropic). If you already did, the Lambda can't read the secret: see the selected helper function's CloudWatch log group (`/aws/lambda/<function-name>`) for `Secrets Manager refused (…)` — usually a customer-managed KMS key or a secret in another account. |
| `That secret belongs to a different AWS account` | This script requires the secret in the selected deployment account. Verify the profile and secret ARN. Creating or granting access to a different secret requires separate authorization. |
| The phone or iPad still starts empty | Family sync isn't on yet: turn it on in *Settings → Family sync* **on the device holding the records** first, then reload the other device. If Settings says "needs one more step", the stack hasn't been updated — run `npm run deploy:aws` once. |
| "This device has records of its own too" | That device was used before sync. *Use the family's school here* replaces its records with the family's; *Make this device's school the family's* does the opposite (for every device). |
| The microphone connects to your iPhone, then "I didn't hear anything" | macOS was offering the iPhone (Continuity) as the default microphone. The school now skips an iPhone/iPad mic and listens with the Mac's built-in one; to pick another, use *Settings → Talking to teachers → Microphone* and **Test the microphone** (the bar should move when you talk). To stop the Mac reaching for the phone everywhere: Mac *System Settings → Sound → Input → MacBook Pro Microphone*, or iPhone *Settings → General → AirPlay & Continuity → Continuity Camera* off. |
| Natural voices sound like the computer's voice | Built-in read-aloud is the fallback. *Check connection* confirms configuration; use *Voice → Test natural voice* for a real provider request. Known quota failures require checking the OpenAI project's credit, billing/budget, and model limits; transient rate limits require waiting. Unknown 429 remains unclassified. Never paste keys or raw provider responses into issues. |
| AI teachers: "not been uploaded yet" | The Lambda still has the placeholder; run `npm run deploy:aws` (or push to `main`). |
| Actions deploy step skipped | Set the secret `AWS_DEPLOY_ROLE_ARN` and the variable `AWS_DEPLOY_ENABLED=true` (step 4). |
| Actions fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Compare the actual subject in CloudTrail with the deploy role's exact trust condition. Verify repository owner/repository IDs and branch, then deploy the corrected stack template. Local SSO sign-in does not repair GitHub OIDC. Confirm a future main deployment authenticates successfully; avoid rerunning an older failed main run, which would publish its older code. |

**Removing the site stack:** empty the selected site bucket (`aws s3 rm "s3://<bucket-name>" --recursive`
and delete old versions in the console), then
`aws cloudformation delete-stack --stack-name "$STACK_NAME" --region us-east-1 --profile "$AWS_PROFILE"`.
This is destructive. Verify the selected resources and recovery plan and obtain
explicit deletion authorization; retained sync resources require separate review.
