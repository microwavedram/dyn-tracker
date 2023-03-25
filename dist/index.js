"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const DYNMAP_URI = "http://globecraft.eu:8033";
const WORLD_FILE = "world";
const PROTECTED_LOCATIONS = [
    { name: "MAIN BASE", x: 3856, z: -3815, r: 500 }
];
const WHITELISTED = [
    "agnat",
    "Chryst4l",
    "localhackerman"
];
//@ts-ignore
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cooldowns = new Map();
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
function logPlayers(players) {
    return __awaiter(this, void 0, void 0, function* () {
        players.forEach(player => {
            console.log(`${player.account} ${player.health}HP ${player.armor}ARMOUR  : ${player.x}, ${player.y}, ${player.z}`);
        });
    });
}
function checkPositions(players) {
    return __awaiter(this, void 0, void 0, function* () {
        players.forEach((player) => __awaiter(this, void 0, void 0, function* () {
            if (!WHITELISTED.includes(player.account)) {
                PROTECTED_LOCATIONS.forEach((Location) => __awaiter(this, void 0, void 0, function* () {
                    const dx = player.x - Location.x;
                    const dz = player.z - Location.z;
                    const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dz, 2));
                    if (distance <= Location.r) {
                        let on_cooldown = false;
                        if (player.account) {
                            const cooldown = cooldowns.get(player.account);
                            if (cooldown) {
                                if (Date.now() < cooldown) {
                                    on_cooldown = true;
                                }
                            }
                        }
                        if (on_cooldown == false) {
                            cooldowns.set(player.account, Date.now() + 30000);
                            console.log(`PLAYER TRESSPASSING [${Location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`);
                            const res = yield fetch("https://discord.com/api/webhooks/1088874611837522032/DV0iYyibcH--zo_nQwSX4v4G4vgcmxSDHM951fc4hgTOcZqHUuyxCY-8i_W8IOQDgWxO", {
                                "method": "POST",
                                "body": yield JSON.stringify({
                                    name: "MOD SATELLITE",
                                    content: `PLAYER TRESSPASSING [${Location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`,
                                }),
                                "headers": {
                                    "Content-Type": "application/json"
                                }
                            });
                            console.log(yield res.text());
                        }
                    }
                }));
            }
        }));
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            const data = yield getInfoForDimention("world");
            if (data) {
                //await logPlayers(data.players)
                //@ts-ignore
                yield checkPositions(data.players);
            }
            yield sleep(2000);
        }
    });
}
main();
