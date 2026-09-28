#!/usr/bin/env bash
# Puts the virtual school on your own AWS account, at your own domain.
#
#   ./scripts/deploy/aws-deploy.sh               first time, or after changing infra/aws/stack.yaml
#   ./scripts/deploy/aws-deploy.sh --password    change the site password
#   ./scripts/deploy/aws-deploy.sh --api-key     add or change the Anthropic API key
#
# Creates/updates one CloudFormation stack in us-east-1 (S3 + CloudFront + HTTPS
# certificate + Route 53 record + site password + AI helper Lambda + GitHub
# deploy role), then builds and uploads the site. Safe to re-run: it only asks
# for things it doesn't already have. Settings via environment variables:
#   AWS_PROFILE (e.g. an IAM Identity Center profile — sign in first with
#     aws sso login --profile <name>)
#   DOMAIN (lms.brianjeanbuilds.com)  STACK_NAME (virtual-school)
#   GITHUB_REPO (jeanbrianc/virtual-school)  HOSTED_ZONE_ID (looked up)
# The stack always goes to us-east-1, whatever the profile's default region:
# CloudFront only uses HTTPS certificates from us-east-1.
set -euo pipefail
cd "$(dirname "$0")/../.."

DOMAIN="${DOMAIN:-lms.brianjeanbuilds.com}"
STACK_NAME="${STACK_NAME:-virtual-school}"
GITHUB_REPO="${GITHUB_REPO:-jeanbrianc/virtual-school}"
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 STACK_NAME
export AWS_PAGER=""

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing '$1'. $2" >&2; exit 1; }; }
need aws "Install the AWS CLI v2 (brew install awscli), then sign in: aws sso login --profile <name>"
need node "Install Node.js 20+ (brew install node)."
need zip "Install zip."
need openssl "Install openssl."

PROFILE_LABEL="${AWS_PROFILE:-default credentials}"
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  if [ -n "${AWS_PROFILE:-}" ]; then
    echo "Not signed in for profile $AWS_PROFILE. Run: aws sso login --profile $AWS_PROFILE" >&2
  else
    echo "Not signed in to AWS. Run 'aws sso login --profile <name>' and re-run with AWS_PROFILE=<name>, or 'aws login'." >&2
  fi
  exit 1
fi
# (The account ID is deliberately not printed.)
echo "AWS profile: $PROFILE_LABEL · region us-east-1 · stack $STACK_NAME · https://$DOMAIN"

stack_exists() { aws cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; }
wants() { [[ " $ARGS " == *" $1 "* ]]; }
ARGS=" $* "

PARAMS=("DomainName=$DOMAIN" "GitHubRepo=$GITHUB_REPO")

# The Route 53 zone that holds the domain (brianjeanbuilds.com for lms.brianjeanbuilds.com).
if [ -z "${HOSTED_ZONE_ID:-}" ]; then
  ZONE="${DOMAIN#*.}"
  HOSTED_ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$ZONE." \
    --query "HostedZones[?Name=='$ZONE.' && Config.PrivateZone==\`false\`].Id | [0]" --output text | sed 's#/hostedzone/##')"
  if [ -z "$HOSTED_ZONE_ID" ] || [ "$HOSTED_ZONE_ID" = "None" ]; then
    echo "Couldn't find a public Route 53 hosted zone named $ZONE in this account. Set HOSTED_ZONE_ID=... and re-run." >&2
    exit 1
  fi
fi
PARAMS+=("HostedZoneId=$HOSTED_ZONE_ID")

FIRST_TIME=false
stack_exists || FIRST_TIME=true

if $FIRST_TIME || wants --password; then
  echo
  echo "Choose the site password (the browser asks for it once; the school's own parent PIN still applies inside)."
  read -r -p "  Username [family]: " SITE_USER
  SITE_USER="${SITE_USER:-family}"
  read -r -s -p "  Password (8+ characters): " SITE_PASS; echo
  read -r -s -p "  Password again: " SITE_PASS2; echo
  if [ "$SITE_PASS" != "$SITE_PASS2" ] || [ "${#SITE_PASS}" -lt 8 ]; then
    echo "Passwords must match and be at least 8 characters." >&2
    exit 1
  fi
  # Only a hash of the browser's "Authorization: Basic …" value is stored in AWS.
  BASIC_AUTH_HASH="$(SITE_USER="$SITE_USER" SITE_PASS="$SITE_PASS" node -e '
    const c = require("crypto");
    const v = "Basic " + Buffer.from(process.env.SITE_USER + ":" + process.env.SITE_PASS, "utf8").toString("base64");
    process.stdout.write(c.createHash("sha256").update(v).digest("hex"));')"
  unset SITE_PASS SITE_PASS2
  PARAMS+=("BasicAuthHash=$BASIC_AUTH_HASH")
fi

if $FIRST_TIME || wants --api-key; then
  echo
  echo "Anthropic API key for the AI teachers (from console.anthropic.com)."
  echo "Leave it empty to keep AI teachers off — the built-in teachers still work."
  read -r -s -p "  API key: " API_KEY; echo
  PARAMS+=("AnthropicApiKey=$API_KEY")
  unset API_KEY
fi

if $FIRST_TIME; then
  PARAMS+=("OriginSecret=$(openssl rand -hex 32)")
  # One GitHub identity provider per AWS account: reuse it if it already exists.
  if aws iam list-open-id-connect-providers --output text --query 'OpenIDConnectProviderList[].Arn' | tr '\t' '\n' | grep -q 'token.actions.githubusercontent.com$'; then
    PARAMS+=("CreateGitHubOidcProvider=false")
  else
    PARAMS+=("CreateGitHubOidcProvider=true")
  fi
  echo
  echo "Creating the stack. The HTTPS certificate and CloudFront take about 5–15 minutes the first time…"
fi

aws cloudformation deploy \
  --template-file infra/aws/stack.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMS[@]}"

echo
echo "Building the site and the AI helper…"
[ -d node_modules ] || npm ci
AI_HELPER_URL=/api npm run build
node scripts/deploy/build-lambda.mjs
bash scripts/deploy/publish.sh

# Automatic deploys from GitHub: the role ARN goes in a repository *secret* (so the
# account ID never shows in public workflow logs) plus a variable that turns deploys on.
ROLE_ARN="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" --output text)"
echo
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  read -r -p "Turn on automatic deploys for github.com/$GITHUB_REPO now (sets a secret and a variable with gh)? [Y/n] " ANSWER
  if [[ ! "$ANSWER" =~ ^[Nn] ]]; then
    printf '%s' "$ROLE_ARN" | gh secret set AWS_DEPLOY_ROLE_ARN --repo "$GITHUB_REPO"
    gh variable set AWS_DEPLOY_ENABLED --repo "$GITHUB_REPO" --body true
    echo "✓ GitHub will deploy every push to main."
    exit 0
  fi
fi
cat <<MSG
Automatic deploys from GitHub (every push to main) — one time, in
https://github.com/$GITHUB_REPO → Settings → Secrets and variables → Actions:
  • Secrets → New repository secret:  AWS_DEPLOY_ROLE_ARN = $ROLE_ARN
  • Variables → New repository variable:  AWS_DEPLOY_ENABLED = true
(Or install the GitHub CLI — brew install gh && gh auth login — and re-run this script.)
MSG
