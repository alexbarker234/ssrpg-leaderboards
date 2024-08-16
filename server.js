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
            const playerData = await fetchCachedData(
                detailCache,
                `${leaderboardId}-${entry.player_id}`,
                getDetailedLocPlayerData,
                leaderboardId,
                entry.player_id
            );
            return {
                name: entry.player_name,
                time: formatTime(entry.score),
                power: playerData.power,
            };
        })
    );
};

/**
 * This provides a rate limit to the leaderboard API so no more than 25 requests per second are made.
 * @param {*} leaderboardId
 * @returns
 */
const processLocLeaderboardLimited = async (leaderboardId) => {
    const response = await getLocationLeaderboardDataCached(leaderboardId, amountToFetch);
    const entries = response.entries;
    const result = [];

    const batchSize = 25;

    console.log(
        `Processing ${entries.length} entries in ${Math.ceil(entries.length / batchSize)} batches of ${batchSize}...`
    );
    for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + 25);
        const batchResults = await Promise.all(
            batch.map(async (entry) => {
                const playerData = await fetchCachedData(
                    detailCache,
                    `${leaderboardId}-${entry.player_id}`,
                    getDetailedLocPlayerData,
                    leaderboardId,
                    entry.player_id
                );
                return {
                    name: entry.player_name,
                    time: formatTime(entry.score),
                    power: playerData.power,
                };
            })
        );
        result.push(...batchResults);

        if (i + 25 < entries.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    return result;
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
                    const data = await processLocLeaderboardLimited(`${leaderboardId}_${difficulty}`);
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
