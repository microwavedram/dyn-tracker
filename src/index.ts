import * as dotenv from "dotenv" 
import * as fs from "fs/promises"
import * as fsd from "fs"
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Guild, GuildMember, IntentsBitField, Message,  MessageEditOptions, TextChannel } from "discord.js"

dotenv.config()

const COOLDOWN = 10000
const DYNMAP_URI = "http://globecraft.eu:8033"
const WORLD_FILE = "world"
const DATABASE_URL = "https://raw.githubusercontent.com/microwavedram/dyn-tracker/master/database.json"
const LOG_CHANNEL_ID = "1088874515209146429"
const GUILD_ID = "1085648041354199170"

const writeStream = fsd.createWriteStream("./session.csv", { encoding: "utf-8" })

const discord_client = new Client({ intents: [ IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages ] })

let log_cache: Map<string, Log> = new Map();
let zone_cache: Map<string, boolean> = new Map();
let session_mutes: string[] = []

let Database: Database

const BYPASS: string[] = [
    "agnat",
    "Chryst4l",
    "localhackerman"
]

//@ts-ignore
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let cooldowns: Map<string, Map<string, number>> = new Map()

interface Database {
    watched_locations: WorldLocation[]
    teams: Team[]
}

interface Log {
    message_id: string,
    timestamp: number,
    muted: boolean,
    detections: number,
    mute_updated: boolean

    player: Player,
    location: WorldLocation
}

interface Player {
    name: string,
    world: string,
    type: string,
    account: string,
    
    x: number,
    y: number,
    z: number,
    
    health: number,
    armor: number,

    sort: number
}

interface Member {
    discord: string,
    username: string,
    role: string
}

interface Team {
    name: string,
    vassals: string[]
    members: Member[]
}

interface WorldLocation {
    name: string,
    coords: number[],
    radius: number,

    teams: string[],
    isPlayer?: boolean
}

const getTeamFromTeamName = (teamname:string) => Database.teams.find(team => team.name == teamname) || {"name":"undefined", "members": [], "vassals": []}

async function refetch_database() {
    await fetch(DATABASE_URL).then(async (data) => {
        Database = await data.json();

        Database.teams.forEach(team => {
            if (cooldowns.get(team.name) == undefined) {
                cooldowns.set(team.name, new Map())
            }
        })


    }).catch(err => {
        Database = require("../database.json")
        Database.teams.forEach(team => {
            if (cooldowns.get(team.name) == undefined) {
                cooldowns.set(team.name, new Map())
            }
        })

        console.warn("error")
    })
}

async function getInfoForDimention(dim: string) {
    return new Promise(async (resolve, rej) => {
        fetch(`${DYNMAP_URI}/up/${WORLD_FILE}/${dim}/${Date.now()}`).then(data => {
            resolve(data.json())
        }).catch(err => {
            resolve(undefined)
        })
    }) 
}

async function checkPositions(players: Player[]) {

    zone_cache.forEach((value, key) => {
        if (value) {
            const username = key.split(":")[1]
            if (!players.some(player => player.account == username)) {
                // offline
                log_cache.delete(key)
                zone_cache.delete(key)
            }
        }
    })

    for (let i = 0; i < players.length; i++) {
        const player = players[i];

        if (player.world != "world") continue
        if (BYPASS.includes(player.account)) continue;

        for (let i = 0; i < Database.watched_locations.length; i++) {
            const location = Database.watched_locations[i];
            const location_cooldowns = cooldowns.get(location.name)

            if (!location_cooldowns) {
                cooldowns.set(location.name, new Map())
            }

            const dx = location.coords[0] - player.x
            const dz = location.coords[1] - player.z
            
            const distance = Math.sqrt( Math.pow(dx,2) + Math.pow(dz,2) )
            
            // if (distance <= 2000) {
            if (distance <= location.radius) {
                const cooldown_time = location_cooldowns?.get(player.account)
                if (cooldown_time) {
                    if (cooldown_time > Date.now()) {
                        continue
                    }
                }

                let allowed_teams: Team[] = location.teams.map(getTeamFromTeamName)

                allowed_teams.forEach(team => {
                    allowed_teams = allowed_teams.concat(team.vassals.map(getTeamFromTeamName))
                })

                //console.log(allowed_teams.map(team => `${team.members.map(member => member.username).join()}`).join())

                if (allowed_teams.some(team => team.members.some(member => member.username == player.account))) continue

                if (session_mutes.includes(`${location.name}:${player.name}`)) continue

                location_cooldowns?.set(player.account, Date.now() + COOLDOWN)
                console.log(`PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z} [${distance} blocks from center]`)

                //@ts-ignore
                zone_cache.set(`${location.name}:${player.name}`, true)
                await createLogMessage(player, location)

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
            } else {
                const removed = zone_cache.delete(`${location.name}:${player.name}`)
                if (removed) {
                    log_cache.delete(`${location.name}:${player.name}`)
                }
            }

            if (location_cooldowns) {
                cooldowns.set(location.name, location_cooldowns)
            }
        }
    }
}

async function logPlayers(players: Player[]) {
    players.forEach(player => {
        writeStream.write(`${player.account},${player.x},${player.z}\n`)
    })
}

async function createLogMessage(player: Player, location: WorldLocation) {
    const guild: Guild | undefined = discord_client.guilds.cache.get(GUILD_ID)
    if (!guild) return;
    const channel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel


    const log = log_cache.get(`${location.name}:${player.name}`)

    let color = 0xffffff
    let next_ignore = false

    if (log && log.mute_updated) return;
    if (log && log.muted) { color = 0xff0000; next_ignore = true};

    const dx = location.coords[0] - player.x
    const dz = location.coords[1] - player.z
    
    const distance = Math.sqrt( Math.pow(dx,2) + Math.pow(dz,2) )
    let bearing = (Math.atan2(-dx,dz) * (180/Math.PI)) % 360

    if (bearing < 0) bearing += 360;

    // kill me
    let dir = ""
    if (bearing > 360-(45/2) || bearing <= (45/2)) dir = "N";
    if (bearing > (45/2) && bearing <= 90-(45/2)) dir = "NE";
    if (bearing > 90-(45/2) && bearing <= 90+(45/2)) dir = "E";
    if (bearing > 90+(45/2) && bearing <= 180-(45/2)) dir = "SE";
    if (bearing > 180-(45/2) && bearing <= 180+(45/2)) dir = "S";
    if (bearing > 180+(45/2) && bearing <= 270-(45/2)) dir = "SW";
    if (bearing > 270-(45/2) && bearing <= 270+(45/2)) dir = "W";
    if (bearing > 270+(45/2) && bearing <= 360-(45/2)) dir = "NW";
    
    let detections = 1
    if (log) {
        detections = log.detections + 1
    }

    const embed = new EmbedBuilder()
    embed.setTitle(`Tresspass log ${player.name}, ${location.name}`)
    embed.setDescription(`${player.name} [${player.account}] was detected within ${location.name}`)
    embed.addFields([
        {name: "Distance", value: `${distance}`, "inline": true},
        {name: "Bearing", value: `[${dir}] ${bearing} degrees`, "inline": true},
        {name: "Detections", value: `${detections}`, "inline": true}
    ])
    embed.setColor(color)
    embed.setTimestamp()
    embed.setAuthor({
        name: "Azorix Satellite Monitoring"
    })
    .setFooter({
        text: `Last Detection: <t:${Date.now()}:R>`
    })

    const row = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
        .setLabel("Mute This Instance [until they leave]")
        .setEmoji("🔉")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("mute-instance")
        .setDisabled(next_ignore),
        new ButtonBuilder()
        .setLabel("Mute For Session [until bot crash]")
        .setEmoji("🔇")
        .setStyle(ButtonStyle.Danger)
        .setCustomId("mute-session")
        .setDisabled(next_ignore),
    )

    const msg: any = {
        content: `<@&1089254990499029014> PLAYER TRESSPASSING [${location.teams.map(teamname => teamname + "'s").join(" and ")} ${location.name}] : ${player.account}`,
        embeds : [embed],
        components: [row]
    }

    if (log) {
        const message: Message<true> | undefined = channel.messages.cache.get(log.message_id)

        log.detections = detections
        if (next_ignore) log.mute_updated = true;
        log_cache.set(`${location.name}:${player.name}`, log)

        
        if (message) {
            await message.edit(msg as MessageEditOptions)
            
            return;
        }

    }
    const message = await channel.send(msg)

    log_cache.set(`${location.name}:${player.name}`, {
        message_id: `${message.id}`,
        timestamp: Date.now(),
        muted: false,
        detections: 1,
        mute_updated: false,

        player: player,
        location: location
    })
}

async function main() {

    console.log("Initialising satellite.")

    discord_client.on("interactionCreate", async interaction => {


        if (interaction.isButton()) {
            //@ts-ignore
            const member = interaction.member as GuildMember
            if (!member.roles.cache.has("1089587118256435300")) {
                interaction.reply({content: "You cant do this BOZO.", ephemeral: true})
                return
            }

            const message = interaction.message

            switch (interaction.customId) {
                case "mute-instance":
                    log_cache.forEach((value, key) => {
                        if (value.message_id == message.id) {
                            value.muted = true
                            log_cache.set(key, value)
                            console.log(log_cache)
                        }
                    });

                    interaction.reply({content: "Muted.", ephemeral: true})

                    break;
                case "mute-session":
                    interaction.reply({content: "Muted", ephemeral: true})

                    log_cache.forEach((value, key) => {
                        if (value.message_id == message.id) {
                            value.muted = true
                            log_cache.set(key, value)
                            session_mutes.push(`${value.location.name}:${value.player.name}`)
                        }
                    });


                    break;
            }
        }
    })

    discord_client.on("ready", async () => {
        console.log(`Discord Bot Running (${discord_client.user?.username}#${discord_client.user?.discriminator})!`)
        console.log("Started up the satellite")

        while (true) {
            const data = await getInfoForDimention("world")

            if (data) {
                await refetch_database()

                //@ts-ignore
                await logPlayers(data.players)
                //@ts-ignore
                await checkPositions(data.players)
            } else {
                console.log("server probably down")
            }

            await sleep(2000)
        }
    })

    discord_client.login(process.env.DISCORD_TOKEN)

    
}

process.removeAllListeners("warning") // FUCK YOU FETCH WARNINGS

main()
