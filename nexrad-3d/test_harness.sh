#!/bin/bash

# NEXRAD-3D Technical Test Harness
# Usage: ./test_harness.sh [SITE] [MODE] [ADDITIONAL_PROMPT]

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  echo "Usage: ./test_harness.sh [SITE] [MODE] [ADDITIONAL_PROMPT]"
  echo "  SITE: Radar site code (default: KHTX)"
  echo "  MODE: Render mode (sweeps, isosurface, combined) (default: isosurface)"
  echo "  ADDITIONAL_PROMPT: Extra technical questions for Gemini"
  exit 0
fi

set -e

SITE=${1:-KHTX}
MODE=${2:-isosurface}
EXTRA_PROMPT=$3
IMAGE_NAME="render.png"

# Create isolated temp dir; clean it up on exit
WORK_DIR=$(mktemp -d)
cleanup() {
  # Guard: only remove if WORK_DIR is a non-root absolute path under /tmp or macOS $TMPDIR
  if [[ "$WORK_DIR" =~ ^/(tmp|var/folders)/. ]]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

# Run nexrad-3d quietly, output image into temp dir
cargo run --quiet -- -s "$SITE" -m "$MODE" -o "$WORK_DIR/$IMAGE_NAME" > /dev/null 2>&1

# Technical prompt for Gemini (file referenced by basename only)
PROMPT="@$IMAGE_NAME Technical review of this NEXRAD 3D $MODE render.
The image is a 2x2 grid of 4 simultaneous camera views (top-left: NE perspective, top-right: top-down, bottom-left: south side, bottom-right: east side).
Analyze each panel: 1. Structural integrity (aliasing, gaps between tilts, blurring quality).
2. Color mapping accuracy (reflectivity thresholds vs NWS scale).
3. Artifacts (voxelization, mesh manifold issues).
4. Cross-view consistency (shape and extent look correct from all 4 angles).
Keep response brief, precise, and plaintext. Avoid lists or markdown. $EXTRA_PROMPT"

# Execute analysis via Gemini CLI inside the temp dir (sandbox restricts it to that dir)
cd "$WORK_DIR"
pnpx @google/gemini-cli --sandbox -p "$PROMPT"
