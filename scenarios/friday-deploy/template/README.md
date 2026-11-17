# trips-service

Prices and records RideMate trips. Schema changes live in db/migrations and run during deploy.

## Commands

    npm test        run unit tests
    git diff        see your changes
    git log         recent commits in the release train
    git show <ref>  one commit in detail, e.g. git show HEAD
    logs <service>  tail production logs (trips, db, gateway)
    rollback        roll production back to the previous release
