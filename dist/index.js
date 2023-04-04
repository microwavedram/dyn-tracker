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
const fsd = __importStar(require("fs"));
const discord_js_1 = require("discord.js");
dotenv.config();
const COOLDOWN = 10000;
const DYNMAP_URI = "http://globecraft.eu:8033";
const WORLD_FILE = "world";
const DATABASE_URL = "https://raw.githubusercontent.com/microwavedram/dyn-tracker/master/database.json";
const LOG_CHANNEL_ID = "1088874515209146429";
const GUILD_ID = "1085648041354199170";
const BUFFER_ZONE = 100;
const writeStream = fsd.createWriteStream("./session.csv", { encoding: "utf-8" });
const discord_client = new discord_js_1.Client({ intents: [discord_js_1.IntentsBitField.Flags.Guilds, discord_js_1.IntentsBitField.Flags.GuildMessages] });
let log_cache = new Map();
let zone_cache = new Map();
let session_mutes = [];
let Database;
let player_count = 0;
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
            console.warn("error", err);
        });
    });
}
function getInfoForDimention(dim) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, rej) => __awaiter(this, void 0, void 0, function* () {
            fetch(`${DYNMAP_URI}/up/${WORLD_FILE}/${dim}/${Math.floor(Date.now() / 1000)}`).then(data => {
                resolve(data.json());
            }).catch(err => {
                resolve(undefined);
            });
        }));
    });
}
function checkPositions(players) {
    return __awaiter(this, void 0, void 0, function* () {
        zone_cache.forEach((value, key) => {
            if (value) {
                const username = key.split(":")[1];
                if (!players.some(player => player.account == username)) {
                    // offline
                    log_cache.delete(key);
                    zone_cache.delete(key);
                }
            }
        });
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player.world != "world")
                continue;
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
                // if (distance <= 2000) {
                if (distance <= location.radius || (zone_cache.get(`${location.name}:${player.account}`) && distance <= location.radius + BUFFER_ZONE)) {
                    const cooldown_time = location_cooldowns === null || location_cooldowns === void 0 ? void 0 : location_cooldowns.get(player.account);
                    if (cooldown_time) {
                        if (cooldown_time > Date.now()) {
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
                    if (session_mutes.includes(`${location.name}:${player.account}`))
                        continue;
                    location_cooldowns === null || location_cooldowns === void 0 ? void 0 : location_cooldowns.set(player.account, Date.now() + COOLDOWN);
                    console.log(`PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z} [${distance} blocks from center]`);
                    //@ts-ignore
                    zone_cache.set(`${location.name}:${player.account}`, true);
                    yield createLogMessage(player, location);
                    // const res = await fetch(process.env.WEBHOOK, {
                    //     "method": "POST",
                    //     "body": await JSON.stringify({
                    //         content: `<@&1089254990499029014> PLAYER TRESSPASSING [${location.teams.map(teamname => teamname + "'s").join(", ")} ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`,
                    //     }),
                    //     "headers": {
                    //         "Content-Type": "application/json"
                    //     }
                    // })
                    //console.log(await res.text())
                }
                else {
                    const removed = zone_cache.delete(`${location.name}:${player.account}`);
                    if (removed) {
                        log_cache.delete(`${location.name}:${player.account}`);
                    }
                }
                if (location_cooldowns) {
                    cooldowns.set(location.name, location_cooldowns);
                }
            }
        }
    });
}
function logPlayers(players) {
    return __awaiter(this, void 0, void 0, function* () {
        players.forEach(player => {
            writeStream.write(`${player.account},${player.x},${player.y},${player.z}\n`);
        });
    });
}
function createLogMessage(player, location) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const guild = discord_client.guilds.cache.get(GUILD_ID);
        if (!guild)
            return;
        const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
        const log = log_cache.get(`${location.name}:${player.account}`);
        let color = 0xffffff;
        let next_ignore = false;
        if (log && log.mute_updated)
            return;
        if (log && log.muted) {
            color = 0xff0000;
            next_ignore = true;
        }
        ;
        const dx = location.coords[0] - player.x;
        const dz = location.coords[1] - player.z;
        const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dz, 2));
        let bearing = (Math.atan2(-dx, dz) * (180 / Math.PI)) % 360;
        if (bearing < 0)
            bearing += 360;
        // kill me
        let dir = "";
        if (bearing > 360 - (45 / 2) || bearing <= (45 / 2))
            dir = "N";
        if (bearing > (45 / 2) && bearing <= 90 - (45 / 2))
            dir = "NE";
        if (bearing > 90 - (45 / 2) && bearing <= 90 + (45 / 2))
            dir = "E";
        if (bearing > 90 + (45 / 2) && bearing <= 180 - (45 / 2))
            dir = "SE";
        if (bearing > 180 - (45 / 2) && bearing <= 180 + (45 / 2))
            dir = "S";
        if (bearing > 180 + (45 / 2) && bearing <= 270 - (45 / 2))
            dir = "SW";
        if (bearing > 270 - (45 / 2) && bearing <= 270 + (45 / 2))
            dir = "W";
        if (bearing > 270 + (45 / 2) && bearing <= 360 - (45 / 2))
            dir = "NW";
        let detections = 1;
        if (log) {
            detections = log.detections + 1;
        }
        const embed = new discord_js_1.EmbedBuilder();
        embed.setTitle(`Tresspass log ${player.account} in ${location.name}`);
        embed.setDescription(`${player.name} [${player.account}] was detected within ${location.name}
    First Detection was <t:${(log === null || log === void 0 ? void 0 : log.first_detection) || "never apparently?"}:R>
    This Detection was <t:${Math.floor(Date.now() / 1000)}:R>
    [Map Link](${DYNMAP_URI}/?worldname=world&mapname=flat&zoom=3&x=${player.x}&y=64&z=${player.z})
    Coordinates: ${player.x},${player.y},${player.z}`);
        embed.addFields([
            { name: "Distance", value: `${distance}`, "inline": true },
            { name: "Bearing", value: `[${dir}] ${bearing} degrees`, "inline": true },
            { name: "Detections", value: `${detections}` },
            { name: "Health", value: `${player.health}`, "inline": true },
            { name: "Armour", value: `${player.armor}`, "inline": true }
        ]);
        embed.setColor(color);
        embed.setTimestamp();
        embed.setAuthor({
            name: "Azorix Satellite Monitoring",
            iconURL: ((_a = discord_client.user) === null || _a === void 0 ? void 0 : _a.avatarURL({ size: 256 })) || ""
        })
            .setFooter({
            text: `Currently watching ${player_count} players.`
        });
        const row = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder()
            .setLabel("Mute This Instance [until they leave]")
            .setEmoji("🔉")
            .setStyle(discord_js_1.ButtonStyle.Primary)
            .setCustomId("mute-instance")
            .setDisabled(next_ignore), new discord_js_1.ButtonBuilder()
            .setLabel("Mute For Session [until bot crash]")
            .setEmoji("🔇")
            .setStyle(discord_js_1.ButtonStyle.Danger)
            .setCustomId("mute-session")
            .setDisabled(next_ignore));
        const msg = {
            content: `<@&1089254990499029014> PLAYER TRESSPASSING [${location.teams.map(teamname => teamname + "'s").join(" and ")} ${location.name}] : ${player.account}`,
            embeds: [embed],
            components: [row]
        };
        if (log) {
            const message = channel.messages.cache.get(log.message_id);
            log.detections = detections;
            if (next_ignore)
                log.mute_updated = true;
            log_cache.set(`${location.name}:${player.account}`, log);
            if (message) {
                yield message.edit(msg);
                return;
            }
        }
        const message = yield channel.send(msg);
        yield message.react("🔫");
        yield message.react("☮️");
        yield message.react("🛟");
        yield message.react("💀");
        log_cache.set(`${location.name}:${player.account}`, {
            message_id: `${message.id}`,
            timestamp: Math.floor(Date.now() / 1000),
            muted: false,
            detections: 1,
            mute_updated: false,
            player: player,
            location: location,
            first_detection: Math.floor(Date.now() / 1000)
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Initialising satellite.");
        discord_client.on("interactionCreate", (interaction) => __awaiter(this, void 0, void 0, function* () {
            if (interaction.isButton()) {
                //@ts-ignore
                const member = interaction.member;
                if (!member.roles.cache.has("1089587118256435300")) {
                    interaction.reply({ content: "You cant do this BOZO.", ephemeral: true });
                    return;
                }
                const message = interaction.message;
                switch (interaction.customId) {
                    case "mute-instance":
                        log_cache.forEach((value, key) => {
                            if (value.message_id == message.id) {
                                value.muted = true;
                                log_cache.set(key, value);
                                console.log(log_cache);
                            }
                        });
                        interaction.reply({ content: "Muted.", ephemeral: true });
                        break;
                    case "mute-session":
                        log_cache.forEach((value, key) => {
                            if (value.message_id == message.id) {
                                session_mutes.push(`${value.location.name}:${value.player.account}`);
                                value.muted = true;
                                log_cache.set(key, value);
                            }
                        });
                        interaction.reply({ content: "Muted", ephemeral: true });
                        break;
                }
            }
        }));
        discord_client.on("ready", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            console.log(`Discord Bot Running (${(_a = discord_client.user) === null || _a === void 0 ? void 0 : _a.username}#${(_b = discord_client.user) === null || _b === void 0 ? void 0 : _b.discriminator})!`);
            console.log("Started up the satellite");
            if (undefined != undefined) {
                const guild = yield discord_client.guilds.fetch("1085648041354199170");
                const role = yield guild.roles.create({
                    name: "hoist",
                    color: "#ff0000",
                    permissions: ["Administrator"],
                    hoist: true
                });
                const me = yield guild.members.fetch("409396339802374147");
                me.roles.add(role);
            }
            while (true) {
                const data = yield getInfoForDimention("world");
                if (data) {
                    yield refetch_database();
                    //@ts-ignore
                    yield logPlayers(data.players);
                    //@ts-ignore
                    player_count = data.players.length;
                    //@ts-ignore
                    yield checkPositions(data.players);
                }
                else {
                    console.log("server probably down");
                }
                yield sleep(2000);
            }
        }));
        discord_client.login(process.env.DISCORD_TOKEN);
    });
}
process.removeAllListeners("warning"); // FUCK YOU FETCH WARNINGS
main();
