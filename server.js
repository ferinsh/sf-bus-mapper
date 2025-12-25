const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const db = require("./db.js");

const app = express();
app.use(express.json());

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
    console.log("Database Ready");
}

app.get("/", (req, res) => {
    res.json({message: "Welcome to server"})
})

app.get("/routes", (req, res) => {
    const routes = db.prepare("SELECT * FROM routes").all();
    res.json(routes);
});

app.get("/routes/:id/stops", (req, res) => {
    const routeId = req.params.id;

    const stops = db.prepare(`
        SELECT DISTINCT
            s.stop_id,
            s.stop_name,
            s.lat,
            s.lon
        FROM trips t
        JOIN stop_times st ON t.trip_id = st.trip_id
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE t.route_id = ?
        ORDER BY st.stop_sequence
    `).all(routeId);

    res.json(stops);
})

loadDatabase().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Listening on PORT: ${PORT}`)
    });
}).catch(err => {
    console.error("Database load failed: ", err)
});
