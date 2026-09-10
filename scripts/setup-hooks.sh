#!/bin/sh
#
# Points git at .githooks and seeds a minimal commit-msg hook if none exists.
#
# .githooks/ is intentionally untracked: it is where each machine keeps its own
# local hooks. This script guarantees a fresh clone still gets the shared
# conventions enforced, without ever overwriting a hook someone has customised.

set -eu

cd "$(dirname "$0")/.."

git rev-parse --git-dir >/dev/null 2>&1 || exit 0
git config core.hooksPath .githooks

hook=".githooks/commit-msg"
[ -e "$hook" ] && exit 0

mkdir -p .githooks
cat > "$hook" <<'HOOK'
#!/bin/sh
#
# Minimal shared commit-msg hook: Conventional Commits, no emoji.
# Seeded by scripts/setup-hooks.sh. Untracked — edit it freely, it is yours.
# Bypass with `git commit --no-verify`.

set -eu

body=$(sed -e '/^# ------------------------ >8 ------------------------$/,$d' \
           -e '/^#/d' "$1")
subject=$(printf '%s\n' "$body" | sed -n '1p')

case "$subject" in
  "Merge "*|"Revert "*|"fixup! "*|"squash! "*|"amend! "*) exit 0 ;;
esac

fail() {
  printf '\ncommit-msg: %s\n  subject: %s\n\nSee CONTRIBUTING.md. Bypass with --no-verify.\n\n' \
    "$1" "$subject" >&2
  exit 1
}

types='build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test'

printf '%s' "$subject" | grep -Eq "^($types)(\([a-z0-9./-]+\))?!?: .+" \
  || fail "subject must be '<type>(<scope>): <subject>'"
[ "${#subject}" -le 72 ] || fail "subject is ${#subject} characters; keep it to 72 or fewer"
case "${subject#*": "}" in *.) fail "drop the trailing period" ;; esac

if command -v perl >/dev/null 2>&1; then
  printf '%s' "$body" | perl -CSD -0777 -ne '
    exit 1 if /[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}]/;
  ' || fail "remove emoji and decorative symbols"
fi

exit 0
HOOK

chmod +x "$hook"
printf 'seeded a minimal commit-msg hook at %s\n' "$hook"
