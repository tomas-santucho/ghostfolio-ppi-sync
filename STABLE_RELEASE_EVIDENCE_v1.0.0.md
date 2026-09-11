# Stable release evidence — v1.0.0

## Release identity

- Stable commit: `5054446`
- Tag: `v1.0.0`
- GitHub Actions run: `34655826462`
- Workflow result: success
- Runtime source remains unchanged from RC candidate `08d1ef6`; the stable
  commit changes release metadata and documentation only.

## Published OCI image

Image: `ghcr.io/tomas-santucho/ghostfolio-ppi-sync:v1.0.0`

| Item | Digest |
| --- | --- |
| OCI index | `sha256:1b52af8f8bb7e0f653b40d59bc93c8a16b83be0e9af10df084d200b7f87d1853` |
| linux/amd64 | `sha256:a631273a61212f9022c3e0347007e4d5073b341cb3387d873bb56fd91a504c15` |
| linux/arm64 | `sha256:f7b50a5d9e001ba392513c3ac58188fab8a0bfac603e221febecf76bab4e6b5b` |

Docker Buildx remote inspection confirms the required two runtime platforms.
The RC image was pulled and smoke-tested successfully on the operator's server.
The final operational confirmation still required for #33 is a pull/smoke of
this exact stable tag on that server; the local Docker Desktop Linux engine is
unavailable.
