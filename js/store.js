// Store layer encapsulating LocalStorage
const STORAGE_KEY = 'smartsubs_data';

const defaultState = {
    matches: [],   // Array of { id, name, date }
    currentMatchId: null,
    // active match data:
    config: null,
    players: [],
    plan: null
};

class Store {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error("Error loading from localStorage", e);
        }
        return window.SmartSubs.Utils.deepClone(defaultState);
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            // Trigger state change event
            window.SmartSubs.State.emit('store_updated', this.data);
        } catch (e) {
            console.error("Error saving to localStorage", e);
        }
    }

    // --- Matches ---

    getMatches() {
        return this.data.matches || [];
    }

    createMatch(name, opponent = '', date = new Date().toISOString().split('T')[0]) {
        const id = window.SmartSubs.Utils.generateUUID();
        const matchMeta = { id, name, opponent, date };

        if (!this.data.matches) this.data.matches = [];
        this.data.matches.push(matchMeta);

        // Setup initial default config for this match
        const config = {
            matchName: name, opponent, date,
            totalMinutes: 60,  // 4 quarters of 15 min = 60 min
            blockMinutes: 1,   // 1 minute blocks for Excel-like timeline
            onFieldCount: 11,
            formationRequirements: { DEF: 3, MID: 4, FWD: 3, GK: 1 }, // Will be derived from starters later
            situationRequirements: {
                // Simplified roles
                pcAttackRequiredRoles: { tiradora: 1, paradora: 1, servidora: 1 },
                pcDefenseRequiredRoles: { corredora: 1, rebotera: 1, poste: 1 }
            },
            priorities: { weightHardRoles: 100, weightMaxStint: 80, weightEquity: 60, weightMaxRest: 40 }, // We keep weights just in case for algorithm flexibility, but we will mostly rely on playTarget now
            strictMode: true
        };

        // Create 20 default players
        const players = [];
        const addPlayer = (pos, namePrefix, startIndex) => {
            const isFirstGK = (pos === 'GK' && startIndex === 1);
            let target = 1; // Default 25% for all outfield bench players
            if (pos === 'GK') {
                target = isFirstGK ? 10 : 0; // 100% or 0% for GKs
            }

            players.push({
                id: window.SmartSubs.Utils.generateUUID(),
                name: `${namePrefix} ${startIndex}`,
                number: startIndex.toString(),
                positionTag: pos,
                playTarget: target,
                isActive: true,
                isStarter: isFirstGK,
                pcAttackRoles: [],
                pcDefenseRoles: []
            });
        };

        addPlayer('GK', 'Jugador', 1);
        addPlayer('GK', 'Jugador', 2);
        for (let i = 1; i <= 6; i++) addPlayer('DEF', 'Jugador', i + 2);
        for (let i = 1; i <= 6; i++) addPlayer('MID', 'Jugador', i + 8);
        for (let i = 1; i <= 6; i++) addPlayer('FWD', 'Jugador', i + 14);

        if (!this.data.matchData) this.data.matchData = {};

        this.data.matchData[id] = {
            config,
            players,
            plan: { blocks: [] }
        };

        this.save();
        return id;
    }

    deleteMatch(id) {
        this.data.matches = this.data.matches.filter(m => m.id !== id);
        if (this.data.matchData && this.data.matchData[id]) {
            delete this.data.matchData[id];
        }
        if (this.data.currentMatchId === id) {
            this.data.currentMatchId = null;
        }
        this.save();
    }

    setCurrentMatch(id) {
        if (this.data.matchData && this.data.matchData[id]) {
            this.data.currentMatchId = id;
            const matchData = this.data.matchData[id];
            this.data.config = matchData.config || {};
            this.data.players = matchData.players || [];
            this.data.plan = matchData.plan || { blocks: [] };
            this.save();
            return true;
        }
        return false;
    }

    getCurrentMatch() {
        return {
            id: this.data.currentMatchId,
            config: this.data.config,
            players: this.data.players,
            plan: this.data.plan
        };
    }

    saveCurrentMatch() {
        const id = this.data.currentMatchId;
        if (id && this.data.matchData) {
            this.data.matchData[id] = {
                config: this.data.config,
                players: this.data.players,
                plan: this.data.plan
            };
            this.save();
        }
    }

    // --- Players ---

    getPlayers() {
        return this.data.players || [];
    }

    addPlayersByPosition(pos, count) {
        if (!this.data.players) this.data.players = [];
        const currentPosPlayers = this.data.players.filter(p => p.positionTag === pos);
        const startIndex = currentPosPlayers.length > 0 ?
            Math.max(...currentPosPlayers.map(p => parseInt(p.number) || 0)) + 1 : 1;

        for (let i = 0; i < count; i++) {
            // First ever GK added should be starter by default
            const isFirstGK = (pos === 'GK' && currentPosPlayers.length === 0 && i === 0);

            let initialTarget = 2; // Default 20% substitute
            if (pos === 'GK') {
                initialTarget = isFirstGK ? 10 : 0; // 100% or 0% for GKs
            } else {
                initialTarget = isFirstGK ? 8 : 2; // Fallback logic (though only GKs can be isFirstGK here)
            }

            this.addPlayer({
                id: window.SmartSubs.Utils.generateUUID(),
                name: `Jugador ${startIndex + i}`,
                number: (startIndex + i).toString(),
                positionTag: pos,
                playTarget: initialTarget,
                isActive: true, // "Juega"
                isStarter: isFirstGK, // "Titular"
                pcAttackRoles: [],
                pcDefenseRoles: []
            });
        }
    }

    removePlayersByPosition(pos, count) {
        if (!this.data.players) return;

        let removed = 0;
        // Iterate backwards to remove from the bottom
        for (let i = this.data.players.length - 1; i >= 0 && removed < count; i--) {
            if (this.data.players[i].positionTag === pos) {
                this.data.players.splice(i, 1);
                removed++;
            }
        }
        this.saveCurrentMatch();
    }

    addPlayer(player) {
        if (!player.id) {
            player.id = window.SmartSubs.Utils.generateUUID();
        }
        if (!this.data.players) this.data.players = [];
        this.data.players.push(player);
        this.saveCurrentMatch();
        return player.id;
    }

    updatePlayer(id, updates) {
        const index = this.data.players.findIndex(p => p.id === id);
        if (index !== -1) {
            this.data.players[index] = { ...this.data.players[index], ...updates };
            this.saveCurrentMatch();
            return true;
        }
        return false;
    }

    deletePlayer(id) {
        this.data.players = this.data.players.filter(p => p.id !== id);
        this.saveCurrentMatch();
    }

    // --- Config & Plan ---

    updateConfig(configUpdates) {
        this.data.config = { ...this.data.config, ...configUpdates };
        this.saveCurrentMatch();
    }

    updatePlan(newPlan) {
        this.data.plan = newPlan;
        this.saveCurrentMatch();
    }
}

// Global namespace
window.SmartSubs = window.SmartSubs || {};
window.SmartSubs.store = new Store();
