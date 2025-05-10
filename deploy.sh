#!/bin/bash

set -e

# Step 1: Get current version
current_version=$(node -p "require('./package.json').version")
echo "📦 Current version: $current_version"

# Step 2: Show commits since last tag
echo ""
echo "📝 Recent changes since v$current_version:"
echo "-------------------------------------------"
if git rev-parse "v$current_version" >/dev/null 2>&1; then
  git log "v$current_version"..HEAD --oneline
else
  echo "⚠️  No Git tag found for v$current_version. Showing last 20 commits instead."
  git log -n 20 --oneline
fi

# Step 3: Ask for changelog input
echo ""
read -p "✍️  Paste your changelog summary (you can copy from your AI): " changelog

# Step 4: Ask for version bump type
echo ""
read -p "🔼 Release type (patch, minor, major): " bump_type

# Step 5: Bump version and create tag
new_version=$(npm version "$bump_type" -m "chore(release): %s")

# Step 6: Confirm tag was created
echo ""
echo "🏷️  New version tag created: $new_version"
if ! git rev-parse "$new_version" >/dev/null 2>&1; then
  echo "❌ Git tag $new_version was not found. Tagging might have failed."
  exit 1
fi

# Step 7: Update man page version
sed -i '' "s/llamb [0-9]*\.[0-9]*\.[0-9]*/llamb ${new_version#v}/" man/man1/llamb.1

# Step 8: Save previous version
echo "$current_version" > previous-version.txt

# Step 9: Append changelog entry
{
  echo ""
  echo "## $new_version"
  echo "$changelog"
  echo ""
} >> CHANGELOG.txt

# Step 10: Commit and push
git add package.json package-lock.json previous-version.txt CHANGELOG.txt man/man1/llamb.1
git commit --amend --no-edit
git push --follow-tags

# Step 11: Publish to NPM
npm publish

echo ""
echo "✅ Successfully published version $new_version to NPM!"