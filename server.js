const express = require("express");
const NodeCache = require("node-cache");
const app = express();
const port = 3000;

const leaderboardIds = require("./ids");

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

const leaderboardCache = new NodeCache({ stdTTL: 60 * 5 }); // 5 min cache
const detailCache = new NodeCache();

const difficulties = [5, 10, 15];
const navItems = [];
Object.keys(leaderboardIds).forEach((id) => {
    navItems.push(
        difficulties.map((difficulty) => {
            return {
                name: `${leaderboardIds[id]} - ${difficulty}☆`,
                href: `/location/${id}_${difficulty}`,
            };
        })
    );
});

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
    const cachedData = detailCache.get(cacheKey);

    if (cachedData && cachedData.score == score) return cachedData;

    console.log(`time for ${playerId} changed, fetching new data`);

    const data = await getDetailedPlayerData(leaderboardId, playerId);

    // store in cache
    detailCache.set(cacheKey, data);
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

const getLeaderboardDataCached = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    const cacheKey = `${leaderboardId}-${count}-${lastScore}-${lastPlayerId}-${startRank}`;
    const cachedData = leaderboardCache.get(cacheKey);

    if (cachedData) return cachedData;

    const data = await getLeaderboardData(leaderboardId, count, lastScore, lastPlayerId, startRank);

    leaderboardCache.set(cacheKey, data);
    return data;
};
const getLeaderboardData = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    console.log(`Fetching leaderboard ${leaderboardId}`);

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
    try {
        res.render("index", { navItems });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error");
    }
});

app.get("/location/:leaderboard_id", async (req, res) => {
    try {
        // Access the leaderboard_id parameter from the request
        const leaderboardId = req.params.leaderboard_id;

        const parts = leaderboardId.split("_");
        const namePart = parts.slice(0, -1).join("_");
        const numberPart = parts[parts.length - 1];

        const name = `${leaderboardIds[namePart]} - ${numberPart}☆`;

        if (leaderboardIds[namePart]) {
            const response = await getLeaderboardDataCached(leaderboardId, 50);

            // fetch detailed player data for data that was updated
            const data = await Promise.all(
                response.entries.map(async (entry) => {
                    const playerData = await getDetailedPlayerDataCached(leaderboardId, entry.player_id, entry.score);
                    return {
                        name: entry.player_name,
                        time: formatTime(entry.score),
                        power: playerData.power,
                    };
                })
            );

            res.render("leaderboard", { name, data, navItems });
        } else {
            res.status(404).json({
                message: `Leaderboard ID ${leaderboardId} not found.`,
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occured");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
