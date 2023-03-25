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

let cooldowns: Map<string,number> = new Map()

interface Database {
    watched_locations: Location[]
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

async function refetch_database() {
    Database = fetch()
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

async function logPlayers(players: Player[]) {
    players.forEach(player => {
        console.log(`${player.account} ${player.health}HP ${player.armor}ARMOUR  : ${player.x}, ${player.y}, ${player.z}`)
    });
}

async function checkPositions(players: Player[]) {
    players.forEach(async player => {

        if (!WHITELISTED.includes(player.account)) {
            PROTECTED_LOCATIONS.forEach(async (Location: WorldLocation) => {
                const dx: number = player.x-Location.x
                const dz: number = player.z-Location.z

                const distance = Math.sqrt(Math.pow(dx,2)+Math.pow(dz,2))

                if (distance <= Location.r) {
                    let on_cooldown = false
                    if (player.account) {
                        const cooldown = cooldowns.get(player.account)
                        if (cooldown) {
                            if (Date.now() < cooldown) {
                                on_cooldown = true
                            }
                        }
                    }
                    
                    if (on_cooldown == false) {
                        cooldowns.set(player.account, Date.now() + 30000)

                        console.log(`PLAYER TRESSPASSING [${Location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`)

                        //@ts-ignore
                        const res = await fetch(process.env.WEBHOOK, {
                            "method": "POST",
                            "body": await JSON.stringify({
                                name: "MOD SATELLITE",
                                content: `PLAYER TRESSPASSING [${Location.name}] : ${player.account} : ${player.x}, ${player.y}, ${player.z}`,
                            }),
                            "headers": {
                                "Content-Type": "application/json"
                            }
                        })
                        console.log(await res.text())
                    }
                }
            })
        }
    });
}

async function main() {
    while (true) {
        const data = await getInfoForDimention("world")

        if (data) {
            //await logPlayers(data.players)
            //@ts-ignore
            await checkPositions(data.players)
        }

        await sleep(2000)
    }
}

main()