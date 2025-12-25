const Database = require("better-sqlite3");

const db = new Database("sfmta.db");

db.exec(`
CREATE TABLE IF NOT EXISTS routes (
  route_id TEXT,
  route_short_name TEXT,
  route_long_name TEXT
);

CREATE TABLE IF NOT EXISTS stops (
  stop_id TEXT,
  stop_name TEXT,
  lat REAL,
  lon REAL
);

CREATE TABLE IF NOT EXISTS stop_times (
  trip_id TEXT,
  stop_id TEXT,
  stop_sequence INTEGER
);

CREATE TABLE IF NOT EXISTS trips (
  trip_id TEXT,
  route_id TEXT
);
`);

module.exports = db;