"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const DYNMAP_URI = "http://globecraft.eu:8033";
const WORLD_FILE = "world";
const DATABASE_URL = "https://raw.githubusercontent.com/microwavedram/dyn-tracker/master/database.json";
let Database;
const BYPASS = [
    "agnat",
    "Chryst4l",
    "localhackerman"
];
//@ts-ignore
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cooldowns = new Map();
const getTeamFromTeamName = (teamname) => Database.teams.find(team => team.name == teamname) || { "name": "undefined", "members": [], "vassals": [] };
function refetch_database() {
    return __awaiter(this, void 0, void 0, function* () {
        yield fetch(DATABASE_URL).then((data) => __awaiter(this, void 0, void 0, function* () {
            Database = yield data.json();
            Database.teams.forEach(team => {
                if (cooldowns.get(team.name) == undefined) {
                    cooldowns.set(team.name, new Map());
                }
            });
        })).catch(err => {
            Database = require("../database.json");
            Database.teams.forEach(team => {
                if (cooldowns.get(team.name) == undefined) {
                    cooldowns.set(team.name, new Map());
                }
            });
            console.warn("error");
        });
    });
}
function getInfoForDimention(dim) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, rej) => __awaiter(this, void 0, void 0, function* () {
            fetch(`${DYNMAP_URI}/up/${WORLD_FILE}/${dim}/${Date.now()}`).then(data => {
                resolve(data.json());
            }).catch(err => {
                console.warn(err);
                resolve(undefined);
            });
        }));
    });
}
function checkPositions(players) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (BYPASS.includes(player.account))
                continue;
            for (let i = 0; i < Database.watched_locations.length; i++) {
                const location = Database.watched_locations[i];
                const location_cooldowns = cooldowns.get(location.name);
                if (!location_cooldowns) {
                    cooldowns.set(location.name, new Map());
                }
                const dx = location.coords[0] - player.x;
                const dz = location.coords[1] - player.z;
                const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dz, 2));
                if (distance <= location.radius) {
                    const cooldown_time = location_cooldowns === null || location_cooldowns === void 0 ? void 0 : location_cooldowns.get(player.account);
                    if (cooldown_time) {
                        if (cooldown_time > Date.now()) {
                            console.log(cooldown_time);
                            continue;
                        }
                    }
                    let allowed_teams = location.teams.map(getTeamFromTeamName);
                    allowed_teams.forEach(team => {
                        allowed_teams = allowed_teams.concat(team.vassals.map(getTeamFromTeamName));
                    });
                    //console.log(allowed_teams.map(team => `${team.members.map(member => member.username).join()}`).join())
                    if (allowed_teams.some(team => team.members.some(member => member.username == player.account)))
                        continue;
                    location_cooldowns === null || location_cooldowns === void 0 ? void 0 : location_cooldowns.set(player.account, Date.now() + 30000);
                    console.log(`PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`);
                    //@ts-ignore
                    const res = yield fetch(process.env.WEBHOOK, {
                        "method": "POST",
                        "body": yield JSON.stringify({
                            content: `<@&1089254990499029014> PLAYER TRESSPASSING [${location.teams.map(teamname => teamname + "'s").join(", ")} ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`,
                        }),
                        "headers": {
                            "Content-Type": "application/json"
                        }
                    });
                    console.log(yield res.text());
                }
                if (location_cooldowns) {
                    cooldowns.set(location.name, location_cooldowns);
                }
            }
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Started up the satellite");
        while (true) {
            const data = yield getInfoForDimention("world");
            if (data) {
                yield refetch_database();
                //await logPlayers(data.players)
                //@ts-ignore
                yield checkPositions(data.players);
            }
            else {
                console.log("server probably down");
            }
            yield sleep(2000);
        }
    });
}
process.removeAllListeners("warning"); // FUCK YOU FETCH WARNINGS
main();
