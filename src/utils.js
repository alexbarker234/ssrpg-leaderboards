function formatDate(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    // Get the appropriate suffix for the day
    const suffix = (day) => {
        if (day > 3 && day < 21) return "th"; // For 11th to 13th
        switch (day % 10) {
            case 1:
                return "st";
            case 2:
                return "nd";
            case 3:
                return "rd";
            default:
                return "th";
        }
    };

    return `${year} ${month} ${day}${suffix(day)}`;
}

const fps = 30;
const formatTime = (frames) => {
    const totalSeconds = Math.floor(frames / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainderFrames = frames % fps;

    return (minutes ? `${minutes}m ` : "") + `${seconds}s ${remainderFrames}F`;
};

module.exports = {
    formatDate,
    formatTime,
};
