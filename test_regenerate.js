const fs = require('fs');

// Mock DOM
global.window = {};
global.document = {
    addEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null
};

// Load store and algorithm
let storeCode = fs.readFileSync('js/store.js', 'utf8');
// remove "window.SmartSubs.store = new Store();"
storeCode = storeCode.replace('window.SmartSubs.store = new Store();', '');
eval(storeCode);

let algoCode = fs.readFileSync('js/algorithm.js', 'utf8');
eval(algoCode);

// Setup
const store = new Store();
// Mock localStorage
let localData = {};
store.saveData = function() { localData['smartsubs_data'] = JSON.stringify(this.data); };
store.loadData = function() { 
    if(localData['smartsubs_data']) {
        this.data = JSON.parse(localData['smartsubs_data']);
    } else {
        this.data = { matches: [], currentMatchId: null, config: { periodsCount: 4, minsPerPeriod: 15, onFieldCount: 11, totalMinutes: 60, blockMinutes: 5, strictMode: false, formationRequirements: { GK: 1, DEF: 4, MID: 3, FWD: 3 } } };
    }
};
store.loadData();

// Create match
store.createMatch('Test Match');
const planner = new Planner(store);
const match = store.getCurrentMatch();

// Add 15 players
store.addPlayersByPosition('GK', 2); // 1, 2
store.addPlayersByPosition('DEF', 5); // 3,4,5,6,7
store.addPlayersByPosition('MID', 5); // 8,9,10,11,12
store.addPlayersByPosition('FWD', 4); // 13,14,15,16

// Make some active/inactive, starters etc.
// 11 starters: 1 GK, 4 DEF, 3 MID, 3 FWD
match.players[0].isStarter = true; match.players[0].playTarget = 10;
match.players[1].isStarter = false; match.players[1].playTarget = 0;

match.players[2].isStarter = true; match.players[2].playTarget = 8;
match.players[3].isStarter = true; match.players[3].playTarget = 8;
match.players[4].isStarter = true; match.players[4].playTarget = 8;
match.players[5].isStarter = true; match.players[5].playTarget = 8;
match.players[6].isStarter = false; match.players[6].playTarget = 2; // sub

match.players[7].isStarter = true; match.players[7].playTarget = 8;
match.players[8].isStarter = true; match.players[8].playTarget = 8;
match.players[9].isStarter = true; match.players[9].playTarget = 8;
match.players[10].isStarter = false; match.players[10].playTarget = 2;
match.players[11].isStarter = false; match.players[11].playTarget = 2;

match.players[12].isStarter = true; match.players[12].playTarget = 8;
match.players[13].isStarter = true; match.players[13].playTarget = 8;
match.players[14].isStarter = true; match.players[14].playTarget = 8;
match.players[15].isStarter = false; match.players[15].playTarget = 2;

store.saveCurrentMatch();

// First Generation
let plan1 = planner.generatePlan();
console.log("Plan 1 - Block 1 OnField:", plan1.blocks[0].onFieldPlayerIds.map(id => match.players.find(p=>p.id===id).number).join(','));
console.log("Plan 1 - Block 2 OnField:", plan1.blocks[1].onFieldPlayerIds.map(id => match.players.find(p=>p.id===id).number).join(','));
store.updatePlan(plan1);

// CHANGE target for Player 3 (DEF) from 8 to 0. Change Player 7 (DEF) from 2 to 10.
match.players[2].playTarget = 0;
match.players[6].playTarget = 10;
store.saveCurrentMatch();

// Second Generation
let plan2 = planner.generatePlan();
console.log("\nPlan 2 - Block 1 OnField:", plan2.blocks[0].onFieldPlayerIds.map(id => match.players.find(p=>p.id===id).number).join(','));
console.log("Plan 2 - Block 2 OnField:", plan2.blocks[1].onFieldPlayerIds.map(id => match.players.find(p=>p.id===id).number).join(','));

