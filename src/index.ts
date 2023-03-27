import * as dotenv from "dotenv" 
import * as fs from "fs/promises"
import * as fsd from "fs"
import { ActionRow, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Guild, IntentsBitField, Message, MessageCreateOptions, MessageEditOptions, MessagePayload, TextChannel } from "discord.js"
import { MessageOptions } from "child_process"

dotenv.config()

const DYNMAP_URI = "http://globecraft.eu:8033"
const WORLD_FILE = "world"
const DATABASE_URL = "https://raw.githubusercontent.com/microwavedram/dyn-tracker/master/database.json"
const LOG_CHANNEL_ID = "0"
const GUILD_ID = "0"

const writeStream = fsd.createWriteStream("./session.csv", { encoding: "utf-8" })

const discord_client = new Client({ intents: [ IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages ] })

let log_cache: Map<string, Log> = new Map();

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
    disabled: boolean,
    unmute_at: number
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

    teams: string[]
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
            console.warn(err)
            resolve(undefined)
        })
    }) 
}

async function checkPositions(players: Player[]) {

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        
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

                location_cooldowns?.set(player.account, Date.now() + 30000)
                console.log(`PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`)

                //@ts-ignore

                await createLogMessage(player, location, distance)

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

async function createLogMessage(player: Player, location: WorldLocation, distance: number) {
    const guild: Guild | undefined = discord_client.guilds.cache.get(GUILD_ID)
    if (!guild) return;
    const channel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel
    
    const embed = new EmbedBuilder()
    embed.setTitle(`Tresspass log ${player.name}, ${location.name}`)

    const row = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
        .setLabel("Mute Instance [until leave]")
        .setEmoji("🔉")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("mute-instance"),
        new ButtonBuilder()
        .setLabel("Mute Session [until bot crash]")
        .setEmoji("🔇")
        .setStyle(ButtonStyle.Danger)
        .setCustomId("mute-session"),
    )

    const msg: MessageCreateOptions = {
        content: `<@&1089254990499029014> PLAYER TRESSPASSING [${location.teams.map(teamname => teamname + "'s").join(" and ")} ${location.name}] : ${player.account}`,
        embeds : [embed],
        components: [row]
    }

    const log = log_cache.get(`${location.name}:${player.name}`)
    if (log) {
        const message: Message<true> | undefined = channel.messages.cache.get(log.message_id)

        if (message) {
            await message.edit(msg as MessageEditOptions)

            return;
        }

    }
    const message = await channel.send(msg)

    
}

async function main() {

    console.log("Initialising discord bot.")

    discord_client.on("interactionCreate", interaction => {

    })

    discord_client.on("ready", () => {
        console.log(`Client Ready ${discord_client.user?.username}!`)
    })

    discord_client.login(process.env.DISCORD_TOKEN)

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
}

process.removeAllListeners("warning") // FUCK YOU FETCH WARNINGS

main()