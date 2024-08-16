const express = require("express");
const NodeCache = require("node-cache");
const app = express();
const port = process.env.PORT ?? 80;
const amountToFetch = process.env.FETCH_AMOUNT ?? 5;
const { leaderboardIds, eventIds } = require("./src/ids.js");
const { formatDate, formatTime } = require("./src/utils.js");

app.set("view engine", "ejs");
app.set("views", "./src/views");
app.use(express.static("./src/public"));

const leaderboardCache = new NodeCache({ stdTTL: 60 * 5 }); // 5 min cache
const detailCache = new NodeCache();
const difficulties = [5, 10, 15];

const navItems = Object.keys(leaderboardIds).map((id) => ({
    name: leaderboardIds[id],
    href: `/location/${id}`,
}));

const fetchCachedData = async (cache, key, fetchFunc, ...args) => {
    const cachedData = cache.get(key);
    if (cachedData) return cachedData;
    const data = await fetchFunc(...args);
    cache.set(key, data);
    return data;
};

const fetchData = async (uri, formData, fixJSON = false) => {
    const response = await fetch(uri, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Request failed.");

    if (fixJSON) {
        const data = await response.text();
        return parseInvalidJson(data);
    }

    return await response.json();
};

const parseInvalidJson = (rawData) => {
    const data = rawData.replace(/([^,{}:]+):/g, '"$1":').replace(/:([^,{}]+)/g, ':"$1"');
    return JSON.parse(data);
};

// Limit calls per second to avoid spamming API
const MAX_CALLS_PER_SECOND = 30;
let tokens = MAX_CALLS_PER_SECOND;
let lastTimestamp = Date.now();

const refillTokens = () => {
    const now = Date.now();
    const elapsedMilliseconds = now - lastTimestamp;
    tokens = Math.min(MAX_CALLS_PER_SECOND, tokens + (elapsedMilliseconds * MAX_CALLS_PER_SECOND) / 1000);
    lastTimestamp = now;
};

const getDetailedLocPlayerDataLimited = async (leaderboardId, playerId, score) => {
    refillTokens();
    const uri = "https://stonestoryrpg.com/lb/location_player.php";

    // Fetch from cache if time hasn't changed
    const cacheKey = `${leaderboardId}-${playerId}`;
    const cachedData = detailCache.get(cacheKey);

    if (cachedData && cachedData.score == score) return cachedData;

    if (tokens > 0) {
        tokens--;

        const formData = new FormData();
        formData.append("leaderboard_id", leaderboardId);
        formData.append("player_id", playerId);

        const data = await fetchData(uri, formData, true);
        detailCache.set(cacheKey, data);

        return data;
    } else {
        return new Promise((resolve) =>
            setTimeout(() => resolve(getDetailedLocPlayerDataLimited(leaderboardId, playerId)), 40)
        );
    }
};

const getDetailedLocPlayerData = async (leaderboardId, playerId) => {
    const uri = "https://stonestoryrpg.com/lb/location_player.php";
    const formData = new FormData();
    formData.append("leaderboard_id", leaderboardId);
    formData.append("player_id", playerId);
    return await fetchData(uri, formData, true);
};

const getLeaderboardData = async (uri, leaderboardId, count, lastScore, lastPlayerId) => {
    const formData = new FormData();
    formData.append("leaderboard_id", leaderboardId);
    formData.append("count", count);
    if (lastScore) formData.append("last_score", lastScore);
    if (lastPlayerId) formData.append("last_player_id", lastPlayerId);
    return await fetchData(uri, formData);
};

const getLocationLeaderboardDataCached = (leaderboardId, count, lastScore, lastPlayerId, startRank = 0) =>
    fetchCachedData(
        leaderboardCache,
        `${leaderboardId}-${count}-${lastScore}-${lastPlayerId}-${startRank}`,
        getLeaderboardData,
        "https://stonestoryrpg.com/lb/location_get.php",
        leaderboardId,
        count,
        lastScore,
        lastPlayerId
    );

const getEventLeaderboardDataCached = (leaderboardId, count, lastScore, lastPlayerId, startRank = 0) =>
    fetchCachedData(
        leaderboardCache,
        `${leaderboardId}-${count}-${lastScore}-${lastPlayerId}-${startRank}`,
        getLeaderboardData,
        "https://stonestoryrpg.com/lb/event_get.php",
        leaderboardId,
        count,
        lastScore,
        lastPlayerId
    );

const processLocLeaderboard = async (leaderboardId) => {
    const response = await getLocationLeaderboardDataCached(leaderboardId, amountToFetch);
    return await Promise.all(
        response.entries.map(async (entry) => {
            const playerData = await getDetailedLocPlayerDataLimited(leaderboardId, entry.player_id, entry.score);
            return {
                name: entry.player_name,
                time: formatTime(entry.score),
                power: playerData.power,
            };
        })
    );
};

const processEventLeaderboard = async (leaderboardId) => {
    const response = await getEventLeaderboardDataCached(leaderboardId, amountToFetch);
    return response.entries.map((entry) => ({
        name: entry.player_name,
        score: entry.score,
    }));
};

app.get("/", (req, res) => res.render("index", { navItems }));

app.get("/events", (req, res) => {
    try {
        const events = Object.keys(eventIds).map((id) => ({
            name: eventIds[id].name,
            href: `/event/${id}`,
            date: formatDate(new Date(eventIds[id].date)),
        }));
        res.render("eventList", { navItems, events });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error");
    }
});

const handleLeaderboardRequest = (fetchFunc, viewName) => async (req, res) => {
    try {
        const leaderboardId = req.params.leaderboard_id;
        const name = leaderboardIds[leaderboardId] || eventIds[leaderboardId];

        if (name) {
            const data = await fetchFunc(leaderboardId);
            res.render(viewName, { name, data, navItems });
        } else {
            res.status(404).json({ message: `Leaderboard ID ${leaderboardId} not found.` });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred");
    }
};

app.get(
    "/location/:leaderboard_id",
    handleLeaderboardRequest(
        async (leaderboardId) =>
            await Promise.all(
                difficulties.map(async (difficulty) => {
                    const data = await processLocLeaderboard(`${leaderboardId}_${difficulty}`);
                    return { difficulty, data, name: `${leaderboardIds[leaderboardId]} - ${difficulty}☆` };
                })
            ),
        "locLeaderboards"
    )
);

app.get("/event/:leaderboard_id", handleLeaderboardRequest(processEventLeaderboard, "eventLeaderboards"));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
