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
  info "Generating release notes from git history..."
  if [ -n "$LAST_TAG" ]; then
    while IFS= read -r LINE; do
      NOTES+=("$LINE")
    done < <(git log "$LAST_TAG..HEAD" --oneline --no-decorate 2>/dev/null | sed 's/^/- /')
  else
    while IFS= read -r LINE; do
      NOTES+=("$LINE")
    done < <(git log --oneline --max-count=10 --no-decorate 2>/dev/null | sed 's/^/- /')
  fi
  ok "Generated ${#NOTES[@]} entries from git log"
fi

# Fallback jika NOTES masih kosong
if [ ${#NOTES[@]} -eq 0 ]; then
  NOTES=("chore: release v$NEXT")
fi

echo ""

# ─── Confirm ──────────────────────────────────────────
read -rp "$(echo -e "${YELLOW}Release ${BOLD}$NEXT${NC}${YELLOW}? [y/N]${NC} ")" CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  warn "Cancelled."
  exit 0
fi

# ─── Update package.json (root) ────────────────────────
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.version = '$NEXT';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ─── Update packages/bns/package.json ──────────────────
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('packages/bns/package.json', 'utf-8'));
pkg.version = '$NEXT';
fs.writeFileSync('packages/bns/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ─── Update CHANGELOG.md ───────────────────────────────
DATE=$(date +%Y-%m-%d)
HEADER="## [$NEXT] - $DATE"

BODY=""
if [ ${#NOTES[@]} -gt 0 ]; then
  for NOTE in "${NOTES[@]}"; do
    BODY="$BODY- $NOTE\n"
  done
fi

ENTRY="$HEADER\n\n$BODY\n---\n"

if [ -f CHANGELOG.md ]; then
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

ok "Root package.json updated to ${BOLD}$NEXT${NC}"
ok "packages/bns/package.json updated to ${BOLD}$NEXT${NC}"
ok "CHANGELOG.md updated"

echo ""

# ─── Git commit & tag ──────────────────────────────────
git add package.json packages/bns/package.json CHANGELOG.md
git commit -m "release: v$NEXT"
git tag -a "v$NEXT" -m "v$NEXT"

ok "Git commit & tag created: ${BOLD}v$NEXT${NC}"

echo ""

# ─── npm publish (create-bns-api) ───────────────────────
read -rp "$(echo -e "${YELLOW}Publish ${BOLD}create-bns-api${NC}${YELLOW} v$NEXT to npm? [y/N]${NC} ")" PUBLISH_CREATE
if [[ "$PUBLISH_CREATE" =~ ^[Yy]$ ]]; then
  info "Publishing create-bns-api v$NEXT to npm..."
  npm publish --access public
  ok "create-bns-api published to npm"
fi

echo ""

# ─── npm publish (bns) ─────────────────────────────────
read -rp "$(echo -e "${YELLOW}Publish ${BOLD}bns${NC}${YELLOW} v$NEXT to npm? [y/N]${NC} ")" PUBLISH_BNS
if [[ "$PUBLISH_BNS" =~ ^[Yy]$ ]]; then
  info "Publishing bns v$NEXT to npm..."
  cd packages/bns
  npm publish --access public
  cd "$ROOT"
  ok "bns published to npm"
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
