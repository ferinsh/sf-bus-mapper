const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const db = require("./db.js");
const { resolve } = require("dns");

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
    console.log("Loading GTFS data...");


    // Load Routes
    loadCSV("data/gtfs/routes.txt", (row) => {
        db.prepare("INSERT INTO routes VALUES (?, ?, ?)").run(
            row.route_id,
            row.route_short_name,
            row.route_long_name
        );
    });
    console.log("Routes Loaded");
    
    // Load Stops
    loadCSV("data/gtfs/stops.txt", (row) => {
        db.prepare("INSERT INTO stops VALUES (?, ?, ?, ?)").run(
            row.stop_id,
            row.stop_name,
            row.stop_lat,
            row.stop_lon
        );
    });
    console.log("Stops Loaded");
    
    // Load Trips
    loadCSV("data/gtfs/trips.txt", (row) => {
        db.prepare("INSERT INTO trips VALUES (?, ?)").run(
            row.trip_id,
            row.route_id
        );
    });
    console.log("Trips Loaded");
    
    // Load Stop Times
    loadCSV("data/gtfs/stop_times.txt", (row) => {
        db.prepare("INSERT INTO stop_times VALUES (?, ?, ?)").run(
            row.trip_id,
            row.stop_id,
            row.stop_sequence
        );
    });
    console.log("Stop Times Loaded");
    console.log("Database Ready");
}

app.get("/", (req, res) => {
    res.json({message: "Welcome to server"})
})

app.get("/routes", (req, res) => {
    const routes = db.prepare("SELECT * FROM routes").all();
    res.json(routes);
});

loadDatabase().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Listening on PORT: ${PORT}`)
    });
}).catch(err => {
    console.error("Database load failed: ", err)
});
