# RC evidence — v1.0.0-rc.1

## Candidate identity

- Branch: `release/v1.0.0`
- Candidate commit: `08d1ef6`
- Tag: `v1.0.0-rc.1`
- GitHub Actions run: `34652129445`
- Publication result: success

## Published OCI image

Image: `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v1.0.0-rc.1`

| Item | Digest |
| --- | --- |
| OCI index | `sha256:7fe42bff6406a2e961a1880db1aad169d66d6fab369915961b4145be43c9b0df` |
| linux/amd64 | `sha256:510cdc4f614bbfcfe832093dfcc59386a3b0a540b1b83b505075b0d7c5c6b333` |
| linux/arm64 | `sha256:dc97b96b507eb0ea146a026d6b422f2336b5cd3328a00fff82c0d401e3e11bf1` |

The published index was inspected remotely with Docker Buildx and contains both
required platforms. GitHub Actions completed the frozen-lockfile install,
typecheck, tests, lint, version/tag check, QEMU setup, and Buildx publication.

## Container validation

The operator verified the published image on a server, including the Docker
pull/smoke path and shared-container lock behavior. This closes the container
publication and Docker operational-validation gates; this workstation's Docker
Desktop Linux engine being unavailable is therefore not a release blocker.

## Remaining RC gates

- Finish the RC failure-campaign record on the exact candidate behavior; the
  offline suite already covers uncertain persistence, partial batches,
  validation rejection, PPI 429, auth refresh, multi-account recovery,
  concurrent-start rejection, and unsupported rows.
