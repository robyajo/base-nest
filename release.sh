#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ─── Colors ────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()  { echo -e "${CYAN}${BOLD}::${NC}${BOLD} $1${NC}"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✖${NC} $1"; }

# ─── Check requirements ────────────────────────────────
command -v git  >/dev/null 2>&1 || { err "git is required"; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "npm is required"; exit 1; }

if ! git diff --quiet; then
  err "Working directory has uncommitted changes. Commit or stash first."
  exit 1
fi

# ─── Read current version ──────────────────────────────
CURRENT=$(node -p "require('./package.json').version")
info "Current version: ${BOLD}${CURRENT}${NC}"

# ─── Calculate next version ────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

if [ "$PATCH" -ge 9 ]; then
  NEW_MINOR=$((MINOR + 1))
  NEW_PATCH=0
  RELEASE_TYPE="minor"
else
  NEW_MINOR=$MINOR
  NEW_PATCH=$((PATCH + 1))
  RELEASE_TYPE="patch"
fi

NEXT="${MAJOR}.${NEW_MINOR}.${NEW_PATCH}"

echo -e "  ${DIM}Type:${NC}  ${BOLD}$RELEASE_TYPE${NC}"
echo -e "  ${DIM}Next:${NC}  ${BOLD}${GREEN}$NEXT${NC}"
echo ""

# ─── Show recent commits for reference ─────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  info "Changes since $LAST_TAG:"
  echo ""
  git log "$LAST_TAG..HEAD" --oneline --no-decorate 2>/dev/null | sed 's/^/    /' || true
  echo ""
else
  info "No previous tag found. Recent commits:"
  echo ""
  git log --oneline --max-count=10 --no-decorate 2>/dev/null | sed 's/^/    /' || true
  echo ""
fi

# ─── Prompt for release notes ──────────────────────────
echo -e "${CYAN}${BOLD}::${NC} Enter release notes (finish with empty line):${NC}"
NOTES=()
while IFS= read -r LINE; do
  [ -z "$LINE" ] && break
  NOTES+=("$LINE")
done

if [ ${#NOTES[@]} -eq 0 ]; then
  warn "No release notes provided."
  NOTES=("No release notes.")
fi

echo ""

# ─── Confirm ──────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Release ${BOLD}$NEXT${NC}${YELLOW}? [y/N]${NC} ")" CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  warn "Cancelled."
  exit 0
fi

# ─── Update package.json ───────────────────────────────
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.version = '$NEXT';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ─── Update CHANGELOG.md ───────────────────────────────
DATE=$(date +%Y-%m-%d)
HEADER="## [$NEXT] - $DATE"

BODY=""
for NOTE in "${NOTES[@]}"; do
  BODY="$BODY- $NOTE\n"
done

ENTRY="$HEADER\n\n$BODY\n---\n"

if [ -f CHANGELOG.md ]; then
  # Insert after first line if it starts with #
  FIRST=$(head -1 CHANGELOG.md)
  if [[ "$FIRST" == "#"* ]]; then
    TAIL=$(tail -n +2 CHANGELOG.md)
    printf "%s\n\n%s%s" "$FIRST" "$ENTRY" "$TAIL" > CHANGELOG.md
  else
    sed -i '' "1s/^/$ENTRY/" CHANGELOG.md
  fi
else
  cat > CHANGELOG.md <<CHLOGEOF
# Changelog

$ENTRY
CHLOGEOF
fi

ok "package.json updated to ${BOLD}$NEXT${NC}"
ok "CHANGELOG.md updated"

echo ""

# ─── Git commit & tag ──────────────────────────────────
git add package.json CHANGELOG.md
git commit -m "release: v$NEXT"
git tag -a "v$NEXT" -m "v$NEXT"

ok "Git commit & tag created: ${BOLD}v$NEXT${NC}"

echo ""

# ─── npm publish ────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Publish to npm? [y/N]${NC} ")" PUBLISH
if [[ "$PUBLISH" =~ ^[Yy]$ ]]; then
  info "Publishing v$NEXT to npm..."
  npm publish
  ok "Published to npm"
fi

echo ""

# ─── Git push ───────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Push commit & tag to remote? [y/N]${NC} ")" PUSH
if [[ "$PUSH" =~ ^[Yy]$ ]]; then
  git push && git push origin "v$NEXT"
  ok "Pushed to remote"
fi

echo ""
ok "${BOLD}Release v$NEXT complete!${NC}"
