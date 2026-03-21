# Dokploy Testnet Deployment

This bundle deploys:

- `numeron-web`: Next.js app for manual multiplayer validation
- `dubhe-channel`: Redis + NATS JetStream backed channel v2 node
- `redis`: snapshot / submit coordination storage
- `nats`: JetStream event bus

## Files

- Compose: [`docker-compose.dokploy-testnet.yml`](/Users/henryliu/obelisk/Dubhe/dubhe-wip/docker-compose.dokploy-testnet.yml)
- Channel image: [`deploy/dokploy/dubhe-channel.Dockerfile`](/Users/henryliu/obelisk/Dubhe/dubhe-wip/deploy/dokploy/dubhe-channel.Dockerfile)
- Web image: [`deploy/dokploy/numeron-web.Dockerfile`](/Users/henryliu/obelisk/Dubhe/dubhe-wip/deploy/dokploy/numeron-web.Dockerfile)
- Env template: [`deploy/dokploy/testnet.env.example`](/Users/henryliu/obelisk/Dubhe/dubhe-wip/deploy/dokploy/testnet.env.example)

## Dokploy Setup

1. Create a new `Docker Compose` application in Dokploy.
2. Point it at this repository and use `docker-compose.dokploy-testnet.yml`.
3. Set the compose source branch to the Dubhe branch you want to deploy.
4. Add the environment variables from `deploy/dokploy/testnet.env.example`.
5. Set `NUMERON_REPO_REF` to the Numeron branch you want the web image to clone during build.
6. Expose `numeron-web` on your public game domain.
7. Expose `dubhe-channel` on your public channel domain.

Recommended domains:

- `numeron-testnet.<your-domain>`
- `channel-testnet.<your-domain>`

## Required Environment Variables

- `CHANNEL_PUBLIC_URL`
- `NEXT_PUBLIC_PRIVATE_KEY`
- `NUMERON_REPO_REF`

## Verification

After deploy:

1. Open the game domain.
2. Open DevTools Network and confirm:
   - `POST /v2/publish`
   - `POST /v2/submit`
   - `POST /v2/subscribe`
3. Move once and confirm the on-screen feed shows:
   - `movement_intent`
   - `fast_path`
   - `position`
   - `submit`

## Notes

- This compose file exposes a single public `dubhe-channel` node for testnet validation.
- Redis and NATS use named volumes so they are safe for Dokploy-managed persistence.
- `numeron-web` clones the Numeron repository at build time, so the Dubhe compose app can stay in the main repo while still building the latest Numeron v2 branch.
- If you want true multi-node public channel ingress on Dokploy, add a second `dubhe-channel-*` service and place them behind an external load balancer.
