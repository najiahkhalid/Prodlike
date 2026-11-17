# notifications-service runbook

## Required configuration (deploy/notifications.env)

The service refuses to start unless all of these are set (see src/config.js):

| Variable        | Production value                     |
| --------------- | ------------------------------------ |
| SMS_PROVIDER    | jazz-sms                             |
| SMS_GATEWAY_URL | https://sms.paydost.internal/v2/send |
| SMS_API_KEY     | pk_live_7f3a91c2e4                   |
| SMS_SENDER_ID   | PAYDOST                              |
| SMS_TIMEOUT_MS  | 3000 (optional)                      |

## Symptoms

- "Missing required env var X" in the logs, then the process restarts in a loop: a variable above is
  missing. Restore it and redeploy.
- Configuration is applied at deploy time from this repository, but it is NOT versioned with the
  service release: rolling back the release keeps the current configuration.
