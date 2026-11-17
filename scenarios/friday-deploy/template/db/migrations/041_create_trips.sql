-- 041: trips and their status history (release v5.1.0)
CREATE TABLE trips (
  id          BIGSERIAL PRIMARY KEY,
  rider_id    BIGINT NOT NULL,
  driver_id   BIGINT,
  status      TEXT NOT NULL DEFAULT 'requested',
  fare        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trip_events (
  id          BIGSERIAL PRIMARY KEY,
  trip_id     BIGINT NOT NULL REFERENCES trips (id),
  type        TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
