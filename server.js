const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const db = require("./db.js");

const app = express();
app.use(express.json());
app.use(express.static("public"))

function loadCSV(file, callback) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(file)
            .pipe(csv())
            .on("data", callback)
            .on("end", resolve)
            .on("error", reject);
    });
};

async function loadDatabase() {
    const insertRoute = db.prepare("INSERT INTO routes VALUES (?, ?, ?)");
    const insertTrip = db.prepare("INSERT INTO trips VALUES (?, ?)");
    const insertStopTime = db.prepare("INSERT INTO stop_times VALUES (?, ?, ?)");
    const insertStop = db.prepare("INSERT INTO stops VALUES (?, ?, ?, ?)");
    const insertShapes = db.prepare("INSERT INTO shapes VALUES (?, ?, ?, ?)");

    console.log("Checking Database");

    const row = db.prepare("SELECT COUNT(*) AS count FROM routes").get();

    if (row.count > 0) {
        console.log("✅ Database already loaded");
        return;
    }

    console.log("Loading GTFS data...");
    
    // Load Routes
    console.log("Loading Routes")
    db.exec("BEGIN");
    await loadCSV("data/gtfs/routes.txt", row => {
        insertRoute.run(
            row.route_id,
            row.route_short_name,
            row.route_long_name
        )
    })
    db.exec("COMMIT");
    console.log("Routes Loaded");

    // Load Trips
    console.log("Loading Trips");
    db.exec("BEGIN");
    await loadCSV("data/gtfs/trips.txt", row => {
        insertTrip.run(row.trip_id, row.route_id);
    });
    db.exec("COMMIT");
    console.log("Trips Loaded");

    // Load Stop Times
    console.log("Loading Stop Times");
    db.exec("BEGIN");
    await loadCSV("data/gtfs/stop_times.txt", row => {
        insertStopTime.run(row.trip_id, row.stop_id, row.stop_sequence);
    });
    db.exec("COMMIT");
    console.log("Stop Times Loaded");
    
    // Load Stops
    console.log("Loading Stops");
    db.exec("BEGIN");
    await loadCSV("data/gtfs/stops.txt", row => {
        insertStop.run(
            row.stop_id,
            row.stop_name,
            row.stop_lat,
            row.stop_lon
        )
    })
    db.exec("COMMIT");
    console.log("Stops Loaded");

    console.log("Loading Shapes");
    db.exec("BEGIN");
    await loadCSV("data/gtfs/shapes.txt", row => {
        insertShapes.run(
            row.shape_id,
            row.shape_pt_lat,
            row.shape_pt_lon,
            row.shape_pt_sequence
        );
    });
    db.exec("COMMIT");
    console.log("Shapes Loaded");
    console.log("Database Ready");
}

function buildGraph() {
  const rows = db.prepare(`
    SELECT
      t.route_id,
      st.trip_id,
      st.stop_id,
      st.stop_sequence
    FROM stop_times st
    JOIN trips t ON st.trip_id = t.trip_id
    ORDER BY st.trip_id, st.stop_sequence
  `).all();

  const graph = {};
  const stopRoutes = {};

  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];

    if (a.trip_id !== b.trip_id) continue;

    if (!graph[a.stop_id]) graph[a.stop_id] = [];
    graph[a.stop_id].push({
      to: b.stop_id,
      route: a.route_id
    });

    if (!stopRoutes[a.stop_id]) stopRoutes[a.stop_id] = new Set();
    stopRoutes[a.stop_id].add(a.route_id);
  }

  return { graph, stopRoutes };
}


app.get("/", (req, res) => {
    res.json({message: "Welcome to server"})
})

// /route and /routes are completely different and serves fully different purposes
app.get("/route", (req, res) => {
  const from = req.query.from;
  const to = req.query.to;

  const { graph } = buildGraph();

  const queue = [[from, []]];
  const visited = new Set();

  while (queue.length) {
    const [current, path] = queue.shift();
    if (current === to) return res.json(path);

    if (visited.has(current)) continue;
    visited.add(current);

    const edges = graph[current] || [];
    for (const e of edges) {
      queue.push([e.to, [...path, e]]);
    }
  }

  res.json({ error: "No route found" });
});

app.get("/routes", (req, res) => {
    const routes = db.prepare("SELECT * FROM routes").all();
    res.json(routes);
});

app.get("/routes/:id/stops", (req, res) => {
    const routeId = req.params.id;

    const trip = db.prepare(`
        SELECT t.trip_id
        FROM trips t
        JOIN stop_times st ON t.trip_id = st.trip_id
        WHERE t.route_id = ?
        GROUP BY t.trip_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
    `).get(routeId);

    if (!trip) return res.json([]);

    const stops = db.prepare(`
        SELECT s.stop_id, s.stop_name, s.lat, s.lon
        FROM stop_times st
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE st.trip_id = ?
        ORDER BY st.stop_sequence
    `).all(trip.trip_id);

    res.json(stops);
});

app.get("/network", (req, res) => {
    const rows = db.prepare(`
        SELECT
            t.route_id,
            s.shape_id,
            s.lat,
            s.lon,
            s.seq
        FROM trips t
        JOIN shapes s ON t.shape_id = s.shape_id
        ORDER BY t.route_id, s.shape_id, s.seq
    `).all();

    const network = {};

    rows.forEach(r => {
        if (!network[r.route_id]) network[r.route_id] = [];
        network[r.route_id].push([r.lat, r.lon]);
    });

    res.json(network);
});



loadDatabase().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Listening on PORT: ${PORT}`)
    });
}).catch(err => {
    console.error("Database load failed: ", err)
});
