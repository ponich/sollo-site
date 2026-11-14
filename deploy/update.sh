#!/bin/sh
set -eu

APP_DIR=/root/apps/sollo-site
GIT_DIR=/root/apps/sollo-site.git
BRANCH=develop
SERVICE=sollo-site

git_repo() {
  git --git-dir="$GIT_DIR" "$@"
}

install_units() {
  cp "$APP_DIR/deploy/sollo-site.service" /etc/systemd/system/
  cp "$APP_DIR/deploy/sollo-site-update.service" /etc/systemd/system/
  cp "$APP_DIR/deploy/sollo-site-update.timer" /etc/systemd/system/
  systemctl daemon-reload
}

release() {
  git_repo --work-tree="$APP_DIR" checkout -f -q "$1"
  install_units
  systemctl restart "$SERVICE"
  sleep 3
  systemctl is-active --quiet "$SERVICE"
}

git_repo fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
target=$(git_repo rev-parse "refs/remotes/origin/$BRANCH")
current=$(git_repo rev-parse -q --verify "refs/heads/$BRANCH" || echo none)

if [ "$target" = "$current" ]; then
  exit 0
fi

echo "Deploying $(git_repo log -1 --format='%h %s' "$target")"
git_repo update-ref "refs/heads/$BRANCH" "$target"

if release "$BRANCH"; then
  echo "Deployed $target"
  exit 0
fi

journalctl -u "$SERVICE" -n 40 --no-pager
if [ "$current" != "none" ]; then
  echo "Rolling back to $current"
  git_repo update-ref "refs/heads/$BRANCH" "$current"
  release "$BRANCH" || true
fi
exit 1
