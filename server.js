const express = require("express");
const NodeCache = require("node-cache");
const app = express();
const port = 3000;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

const cache = new NodeCache();

const fps = 30;
const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainderFrames = frames % fps;

    return (minutes ? `${minutes}m ` : "") + `${seconds}s ${remainderFrames}F`;
};

const getDetailedPlayerDataCached = async (leaderboardId, playerId, score) => {
    // get from cache if the time is the same
    const cacheKey = `${leaderboardId}-${playerId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData && cachedData.score == score) {
        return cachedData;
    }
    console.log(`time for ${playerId} changed, fetching new data`);

    const data = await getDetailedPlayerData(leaderboardId, playerId);

    // store in cache
    cache.set(cacheKey, data);
    return data;
};

const getDetailedPlayerData = async (leaderboardId, playerId) => {
    const uri = "https://stonestoryrpg.com/lb/location_player.php";
    const formData = new FormData();
    formData.append("leaderboard_id", leaderboardId);
    formData.append("player_id", playerId);

    const response = await fetch(uri, {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        throw new Error("Request failed.");
    }

    var data = await response.text();

    // the json returned is invalid. why
    // this wraps everything in quotes. parse it later if you need it
    data = data.replace(/([^,{}]+):/g, '"$1":').replace(/:([^,{}]+)/g, ':"$1"');
    const json = JSON.parse(data);

    return json;
};

const getLeaderboardData = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    const uri = "https://stonestoryrpg.com/lb/location_get.php";
    const formData = new FormData();
    formData.append("leaderboard_id", leaderboardId);
    formData.append("count", count);
    if (lastScore !== null) {
        formData.append("last_score", lastScore);
    }
    if (lastPlayerId !== null) {
        formData.append("last_player_id", lastPlayerId);
    }
    const response = await fetch(uri, {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        throw new Error("Request failed.");
    }
    return await response.json();
};

app.get("/", async (req, res) => {
    const locId = "rocky_plateau_15";
    try {
        const response = await getLeaderboardData(locId, 50);

        // fetch detailed player data for data that was updated
        const data = await Promise.all(
            response.entries.map(async (entry) => {
                const playerData = await getDetailedPlayerDataCached(locId, entry.player_id, entry.score);
                return {
                    name: entry.player_name,
                    time: formatTime(entry.score),
                    power: playerData.power,
                };
            })
        );

        res.render("index", { data });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
