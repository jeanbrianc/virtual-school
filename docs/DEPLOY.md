# Hosting the school on your own AWS account

This puts the school at **https://lms.brianjeanbuilds.com** (or any name in a
Route 53 zone you own), behind a family password, with the AI teachers served
from your account. After the one-time setup, every push to `main` on GitHub
deploys automatically.

```
Browser ──HTTPS──▶ CloudFront (lms.brianjeanbuilds.com)
                    │  site password checked at the edge (CloudFront Function)
                    ├─ /*      ─▶ private S3 bucket (the built site)
                    └─ /api/*  ─▶ Lambda: AI helper ─▶ Anthropic API
                                   (answers only requests that came through CloudFront)
GitHub push to main ─▶ Actions: typecheck · lint · tests · build ─▶ S3 + Lambda + cache refresh
```

Everything is one CloudFormation stack: [`infra/aws/stack.yaml`](../infra/aws/stack.yaml).

## What it costs

| Piece | Monthly cost for a family |
| --- | --- |
| CloudFront (HTTPS, CDN, password function) | $0 — well inside AWS's always-free CloudFront allowance (1 TB, 10 million requests) |
| S3 (≈3 MB of site files) | under $0.01 |
| Lambda (AI helper) | $0 — inside the Lambda free tier |
| HTTPS certificate (ACM) | $0 |
| Route 53 | the $0.50 you already pay for the brianjeanbuilds.com zone |
| AI teachers (Anthropic API) | about 0.2¢ per reply with Claude Haiku 4.5; nothing if you leave the key empty |

Tip: set a monthly spend limit for the API key's workspace in the Anthropic
Console. The helper also caps replies per day (`AiDailyLimit`, 300).

## One-time setup (on your Mac, ~20 minutes, mostly waiting)

1. **Tools.** Install the AWS CLI and sign in:

   ```bash
   brew install awscli        # needs AWS CLI 2.32+ for `aws login`
   aws login                  # opens the browser; or use `aws configure sso`
   ```

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
   npm run deploy:aws          # same as ./scripts/deploy/aws-deploy.sh
   ```

   It finds the `brianjeanbuilds.com` hosted zone, asks for a **site username and
   password** (only a hash is stored in AWS) and your **Anthropic API key** (press
   Enter to leave AI teachers off), creates the stack in `us-east-1` — the certificate
   and CloudFront take 5–15 minutes the first time — then builds and uploads the site
   and the AI helper.

4. **Turn on automatic deploys.** The script prints a role ARN. In GitHub →
   *jeanbrianc/virtual-school → Settings → Secrets and variables → Actions → Variables*,
   add a repository variable `AWS_DEPLOY_ROLE_ARN` with that value. No AWS keys are
   stored in GitHub: Actions signs in with OpenID Connect to a role that can only
   upload this site, update this Lambda and refresh this CloudFront distribution —
   and only for pushes to `main` of this repository.

5. **Open https://lms.brianjeanbuilds.com**, enter the site password, and set up the
   school like on your Mac. To use the AI teachers there: *Grown-ups → Settings & privacy
   → AI teachers* → **Check connection** → tick consent → **Turn on AI teachers** (the
   helper address is already `/api`).

## Everyday

- **Change something → push to `main`.** Actions checks and deploys in a few minutes.
- **Change the site password:** `npm run deploy:aws -- --password`
- **Add or change the API key:** `npm run deploy:aws -- --api-key`
- **Change the stack itself** (edited `infra/aws/stack.yaml`): `npm run deploy:aws`

## Good to know

- **Each browser keeps its own school.** Records live in the browser (IndexedDB), per
  device and per address. The school at `127.0.0.1:5173` on your Mac and the one at
  `lms.brianjeanbuilds.com` are separate, and an iPad has its own. Pick the address
  Izzy will use day to day. *Settings → Export* makes a backup file; there's no sync
  between devices yet.
- **The password covers everything**, including `/api`, so nobody without it can
  use your API key. The Lambda also refuses any request that didn't come through
  CloudFront (a secret header only CloudFront adds). The parent PIN inside the
  school still guards the Parent Studio.
- **Talking works on the hosted site** (it's HTTPS, and the page allows the
  microphone for itself). Her first tap on the microphone sets it up in that browser.
- **The code on GitHub is public** and includes Izzy's name and birthday in
  `src/data/seed/`. The live site is behind the password.
- **Search engines are told not to index** the site (`X-Robots-Tag: noindex`).

## Troubleshooting

| What you see | Why / what to do |
| --- | --- |
| `Deploy this stack in us-east-1` | The script already uses us-east-1; if you deploy by hand, add `--region us-east-1`. |
| Stack creation sits on `Certificate` | DNS validation takes a few minutes; it needs the Route 53 zone to be the one the domain actually uses (check the NS records at your registrar). |
| Password prompt keeps coming back | Wrong username/password; reset with `--password`. Safari/iPad: saved passwords are per site. |
| AI teachers: "has no API key yet" | Run `npm run deploy:aws -- --api-key`. |
| AI teachers: "not been uploaded yet" | The Lambda still has the placeholder; run `npm run deploy:aws` (or push to `main`). |
| Actions deploy step skipped | Add the `AWS_DEPLOY_ROLE_ARN` repository variable (step 4). |

**Removing everything:** empty the bucket (`aws s3 rm s3://<BucketName> --recursive`
and delete old versions in the console), then
`aws cloudformation delete-stack --stack-name virtual-school --region us-east-1`.
