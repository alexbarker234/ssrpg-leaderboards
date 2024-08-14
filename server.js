const express = require("express");
const app = express();
const port = 3000;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

const fps = 30;
const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainderFrames = frames % fps;

    return (minutes ? `${minutes}m ` : "") + `${seconds}s ${remainderFrames}F`;
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
    try {
        const response = await getLeaderboardData("rocky_plateau_15", 50);
        const data = response.entries.map((entry) => {
            return {
                name: entry.player_name,
                time: formatTime(entry.score),
            };
        });

        res.render("index", { data });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
