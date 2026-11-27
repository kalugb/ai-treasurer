#!/usr/bin/env bash
# Trivy scan: dependencies (uv.lock, bun.lock), hard-coded secrets, Dockerfile/compose misconfig.
# Usage: scripts/trivy-scan.sh [--images]   (--images also builds and scans the Docker images)
# Report-only by default. For production gating run with TRIVY_EXIT_CODE=1 (fails on findings).
# Uses a local `trivy` if installed, otherwise the aquasec/trivy Docker image.
set -euo pipefail
cd "$(dirname "$0")/.."

SEVERITY="HIGH,CRITICAL"
EXIT_CODE="${TRIVY_EXIT_CODE:-0}"
# Gitignored local secrets that exist on disk: never scan or print them.
SKIP=(--skip-dirs node_modules --skip-dirs .venv --skip-dirs .git --skip-dirs backend/google_creds
      --skip-files backend/.env --skip-files backend/.env.docker)

if command -v trivy >/dev/null 2>&1; then
    run() { trivy "$@"; }
    run_img() { trivy "$@"; }
else
    # Named volume keeps the vulnerability database between runs.
    run() { docker run --rm -v "$PWD:/work:ro" -w /work -v trivy-cache:/root/.cache aquasec/trivy:latest "$@"; }
    run_img() { docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache aquasec/trivy:latest "$@"; }
fi

echo "== Filesystem: vulnerabilities, secrets, misconfig =="
run fs --scanners vuln,secret,misconfig --severity "$SEVERITY" --ignore-unfixed \
    "${SKIP[@]}" --exit-code "$EXIT_CODE" .

if [ "${1:-}" = "--images" ]; then
    for name in backend frontend; do
        echo "== Image: $name =="
        docker build -q -t "ai-treasurer-$name:scan" "./$name"
        run_img image --severity "$SEVERITY" --ignore-unfixed --exit-code "$EXIT_CODE" "ai-treasurer-$name:scan"
    done
fi
echo "Trivy scan finished (exit code mode: $EXIT_CODE)."
