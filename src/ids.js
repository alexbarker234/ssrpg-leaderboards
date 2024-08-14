const leaderboardIds = {
    rocky_plateau: "Rocky Plateau",
    deadwood_valley: "Deadwood Canyon",
    caustic_caves: "Caves of Fear",
    fungus_forest: "Mushroom Forest",
    undead_crypt: "Haunted Halls",
    bronze_mine: "Boiling Mine",
    icy_ridge: "Icy Ridge",
    temple: "Temple",
};

// Much older events do not have leaderboards
const eventIds = {
    spring: { name: "Spring Equinox", date: "2024-03-01" },
    summer: { name: "Summer Moonstice", date: "2024-03-01" },
    hamartia: { name: "Hamartia", date: "2024-03-01" },
    bolesh_2x: { name: "Fangs in the Dark", date: "2024-03-01" },
    towering: { name: "Towering Defenses", date: "2024-03-01" },
    aether_talisman: { name: "Aether Talisman", date: "2024-03-01" },
    burnout: { name: "Burnout", date: "2024-03-01" },
    BFG_reheat: { name: "Pallas' Judgment", date: "2024-03-01" },
    anniversary2024: { name: "10 Year Anniversary", date: "2024-03-01" },
};

module.exports = { leaderboardIds, eventIds };
