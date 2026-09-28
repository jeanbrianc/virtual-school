#!/usr/bin/env bash
# Uploads an already-built site (dist/) and AI helper (dist-lambda/ai-helper.zip)
# to the AWS stack made by infra/aws/stack.yaml. Used by aws-deploy.sh and by
# GitHub Actions. Needs AWS credentials for the account (region us-east-1).
set -euo pipefail
cd "$(dirname "$0")/../.."

STACK_NAME="${STACK_NAME:-virtual-school}"
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

BUCKET="$(output BucketName)"
DISTRIBUTION="$(output DistributionId)"
FUNCTION="$(output AiFunctionName)"
SITE_URL="$(output SiteUrl)"

[ -f dist/index.html ] || { echo "No build found. Run: AI_HELPER_URL=/api npm run build" >&2; exit 1; }
if ! grep -qs '"/api"' dist/assets/*.js; then
  echo "dist/ looks like a local build (AI helper = 127.0.0.1). Rebuild with: AI_HELPER_URL=/api npm run build" >&2
  exit 1
fi

echo "→ Uploading site to s3://$BUCKET"
# New hashed assets first (cached for a year), then the pages that point at
# them (always revalidated), then remove assets no page uses any more.
aws s3 sync dist/assets "s3://$BUCKET/assets" --exclude '*.map' \
  --cache-control 'public, max-age=31536000, immutable' --only-show-errors
aws s3 sync dist "s3://$BUCKET" --delete --exclude 'assets/*' --exclude '*.map' --exclude 'meta.json' \
  --cache-control 'no-cache' --only-show-errors
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --exclude '*.map' \
  --cache-control 'public, max-age=31536000, immutable' --only-show-errors

if [ -f dist-lambda/ai-helper.zip ]; then
  echo "→ Updating AI helper ($FUNCTION)"
  aws lambda update-function-code --function-name "$FUNCTION" \
    --zip-file fileb://dist-lambda/ai-helper.zip --query 'LastUpdateStatus' --output text >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION"
fi

echo "→ Refreshing CloudFront"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/' '/index.html' \
  --query 'Invalidation.Id' --output text >/dev/null

echo "✓ Live at $SITE_URL"
