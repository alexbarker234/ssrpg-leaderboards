const express = require("express");
const NodeCache = require("node-cache");
const app = express();
const port = process.env.PORT ?? 80;
const amountToFetch = process.env.FETCH_AMOUNT ?? 5;
const { leaderboardIds, eventIds } = require("./src/ids.js");

app.set("view engine", "ejs");
app.set("views", "./src/views");
app.use(express.static("./src/public"));

const leaderboardCache = new NodeCache({ stdTTL: 60 * 5 }); // 5 min cache
const detailCache = new NodeCache();

const difficulties = [5, 10, 15];
const navItems = [];
Object.keys(leaderboardIds).forEach((id) => {
    navItems.push({
        name: `${leaderboardIds[id]}`,
        href: `/location/${id}`,
    });
});

const fps = 30;
const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainderFrames = frames % fps;

    return (minutes ? `${minutes}m ` : "") + `${seconds}s ${remainderFrames}F`;
};

const getDetailedLocPlayerDataCached = async (leaderboardId, playerId, score) => {
    // get from cache if the time is the same
    const cacheKey = `${leaderboardId}-${playerId}`;
    const cachedData = detailCache.get(cacheKey);

    if (cachedData && cachedData.score == score) return cachedData;

    console.log(`time for ${playerId} changed, fetching new data`);

    const data = await getDetailedLocPlayerData(leaderboardId, playerId);

    // store in cache
    detailCache.set(cacheKey, data);
    return data;
};

const getDetailedLocPlayerData = async (leaderboardId, playerId) => {
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

    const rawData = await response.text();

    // the json returned is invalid. why
    // this wraps everything in quotes. parse it later if you need it
    // some people have colons in their names. Bro
    const data = rawData.replace(/([^,{}:]+):/g, '"$1":').replace(/:([^,{}]+)/g, ':"$1"');
    var json;
    try {
        json = JSON.parse(data);
    } catch (error) {
        console.log(rawData);
        console.log(data);
        throw error;
    }
    return json;
};

const getLocationLeaderboardDataCached = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    const cacheKey = `${leaderboardId}-${count}-${lastScore}-${lastPlayerId}-${startRank}`;
    const cachedData = leaderboardCache.get(cacheKey);

    if (cachedData) return cachedData;

    const data = await getLocationLeaderboardData(leaderboardId, count, lastScore, lastPlayerId, startRank);

    leaderboardCache.set(cacheKey, data);
    return data;
};
const getLocationLeaderboardData = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
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
const getEventLeaderboardDataCached = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    const cacheKey = `${leaderboardId}-${count}-${lastScore}-${lastPlayerId}-${startRank}`;
    const cachedData = leaderboardCache.get(cacheKey);

    if (cachedData) return cachedData;

    const data = await getEventLeaderboardData(leaderboardId, count, lastScore, lastPlayerId, startRank);

    leaderboardCache.set(cacheKey, data);
    return data;
};
const getEventLeaderboardData = async (leaderboardId, count, lastScore = null, lastPlayerId = null, startRank = 0) => {
    console.log(`Fetching leaderboard ${leaderboardId}`);

    const uri = "https://stonestoryrpg.com/lb/event_get.php";
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
app.get("/events", async (req, res) => {
    try {
        const events = Object.keys(eventIds).map((id) => {
            return {
                name: eventIds[id],
                href: `/event/${id}`,
            };
        });
        res.render("eventList", { navItems, events });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error");
    }
});

const processLocLeaderboard = async (leaderboardId) => {
    const response = await getLocationLeaderboardDataCached(leaderboardId, amountToFetch);

    // fetch detailed player data for data that was updated
    const data = await Promise.all(
        response.entries.map(async (entry) => {
            const playerData = await getDetailedLocPlayerDataCached(leaderboardId, entry.player_id, entry.score);
            return {
                name: entry.player_name,
                time: formatTime(entry.score),
                power: playerData.power,
            };
        })
    );
    return data;
};

const processEventLeaderboard = async (leaderboardId) => {
    const response = await getEventLeaderboardDataCached(leaderboardId, amountToFetch);

    const data = response.entries.map((entry) => {
        return {
            name: entry.player_name,
            score: entry.score,
        };
    });
    return data;
};

app.get("/location/:leaderboard_id", async (req, res) => {
    try {
        const leaderboardId = req.params.leaderboard_id;

        const name = leaderboardIds[leaderboardId];

        if (leaderboardIds[leaderboardId]) {
            const allBoards = await Promise.all(
                difficulties.map(async (difficulty) => {
                    const data = await processLocLeaderboard(`${leaderboardId}_${difficulty}`);
                    return { difficulty, data, name: `${leaderboardIds[leaderboardId]} - ${difficulty}☆` };
                })
            );
            res.render("locLeaderboards", { name, data: allBoards, navItems });
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

app.get("/event/:leaderboard_id", async (req, res) => {
    try {
        const leaderboardId = req.params.leaderboard_id;

        const name = eventIds[leaderboardId];

        if (eventIds[leaderboardId]) {
            const data = await processEventLeaderboard(`${leaderboardId}`);
            console.log(data);
            res.render("eventLeaderboards", { name, data, navItems });
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
    console.log(`Server is running on port ${port}`);
});
