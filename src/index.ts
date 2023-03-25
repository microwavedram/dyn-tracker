import * as dotenv from "dotenv" 

dotenv.config()

const DYNMAP_URI = "http://globecraft.eu:8033"
const WORLD_FILE = "world"
const DATABASE_URL = "https://raw.githubusercontent.com/microwavedram/dyn-tracker/master/database.json"

let Database: Database

const BYPASS: string[] = [
    "agnat",
    "Chryst4l",
    "localhackerman"
]

//@ts-ignore
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const cooldowns: Map<string, Map<string, number>> = new Map()

interface Database {
    watched_locations: WorldLocation[]
    teams: Team[]
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


    }).catch(console.warn)
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
            
            console.log(Database)
            console.log(location)

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

                const allowed_teams: Team[] = location.teams.map(getTeamFromTeamName)

                allowed_teams.forEach(team => {
                    allowed_teams.concat(team.vassals.map(getTeamFromTeamName))
                })

                if (allowed_teams.some(team => team.members.some(member => member.username == player.account))) continue

                location_cooldowns?.set(player.account, Date.now() + 30000)
                console.log(`PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`)

                //@ts-ignore
                const res = await fetch(process.env.WEBHOOK, {
                    "method": "POST",
                    "body": await JSON.stringify({
                        content: `PLAYER TRESSPASSING [${location.teams.join()}'s ${location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`,
                    }),
                    "headers": {
                        "Content-Type": "application/json"
                    }
                })
                
                console.log(await res.text())
            }
        }
    }
}

async function main() {

    while (true) {
        const data = await getInfoForDimention("world")

        if (data) {
            await refetch_database()

            //await logPlayers(data.players)
            //@ts-ignore
            await checkPositions(data.players)
        }

        await sleep(2000)
    }
}

main()