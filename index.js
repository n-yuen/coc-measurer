var clashApi = require('clash-of-clans-api')
var fs = require('file-system')

require('dotenv').config()

const setup = require('./setup.json')

var clanTag

var client = clashApi({
    token: process.env.COC_API_KEY
})


function loadFile(name) {
    return new Promise((resolve, reject) => {
        fs.readFile(name, 'utf8', (err, data) => {
            try {
                var ret = JSON.parse(data)
                resolve(ret)
            } catch (e) {
                reject(1)
            }
        })
    })
}

// function getEndTime() = client.clanCurrentWarByTag(setup.clan_tag).then(res => {
//     if (res === undefined)
//         return undefined
//     return new Date(parseTime(res.endTime).valueOf() - 60000) // One minute before the end of the war
// }).catch((err) => console.log(err))

function initialize_war() {
    getEndTime.then((res) => {
        setTimeout(updateWarResults, res - Date.now())
    }).catch((err) => console.log(err))
}

function updateWarResults() {

}

function parseTime(t) {     // Dates from the CoC api come in a funny format
    return new Date(Date.UTC(
        t.substr(0, 4),         // yr
        t.substr(4, 2) - 1,     // mo
        t.substr(6, 2),         // day
        t.substr(9, 2),         // hr
        t.substr(11, 2),        // min
        t.substr(13, 2)         // sec
    ))
}

function getWarLeagueInfo() {
    return client.clanLeague(setup.clan_tag).then(res => {
        console.log(here)
        for (var r of res.rounds){
            for (var w of r.warTags){
                if (w != '#0'){
                    console.log(w)
                    client.clanLeagueWars(w).then(res2 => {
                        console.log(res2)
                    }).catch((err) => {
                        console.log(err)
                    })
                }
            }
        }
    })
}

function getWarInfo(war){
    var data = {}
    if (war === undefined)
        reject(1)

    if (war.state == 'preparation')
        reject(2)

    var clan = war.clan
    var num_members = war.clan.num_members
    //var attack
    var all_attacks = []

    for (var i = 0; i < num_members; i++) {

        var member = clan.members[i]

        var toAdd = {
            name: member.name,
            tag: member.tag,
            th: member.townHallLevel,
            attacks: [],
            defenses: []
        }

        //var n_attacks = member.attacks.length()
        for (var a of member.attacks) {
            all_attacks.push(a)
            toAdd.attacks.push(a)
        }

        all_attacks.sort((a, b) => {
            return (a.order - b.order)
        })

        for (var a of all_attacks) {
            var prev_stars = 0
            var len = a.order
            var a2
            for (var z = 0; z < len; z++) {
                a2 = all_attacks[z]
                if (a2.attackerTag == attack.attackerTag) {
                    prev_stars = Math.max(prev_stars, a2.stars)
                }
            }
            a.newStars = a.stars - prev_stars
        }

        

        console.log(member.attacks)

        toAdd.attacksUsed = toAdd.attacks.length
        //data.push()
    }

    return data
}

function getCurrentWarInfo() {
    return new Promise((resolve, reject) => {
        client.clanCurrentWarByTag(setup.clan_tag).then(res => {
            return getWarInfo(res)
        })
        //client.clan
    })
}

function setupClan() {  // get JSON containing clan and players
    return client.clanByTag(setup.clan_tag).then(res => {
        var data = {}
        data.clan_info = {
            name: res.name,
            level: res.clanLevel,
            wins: res.warWins,
            ties: res.warTies,
            losses: res.warLosses,
            winStreak: res.warWinStreak,
            longestWinStreak: res.warWinStreak,
            tag: res.tag
        }
        var members = res.memberList

        var promises = []

        for (var m of members) { // Get detailed player information for each player as promises
            promises[i] = client.playerByTag(m.tag).then(res2 => {
                var toAdd = {
                    tag: res2.tag,
                    name: res2.name,
                    th: res2.townHallLevel,
                    rank: res2.role == 'admin' ? 'elder' : res2.role,
                    stars: res2.warStars,
                    level: res2.expLevel,
                    wars_participated: 0
                }
                return toAdd
            })
        }

        return Promise.all(promises).then((values) => {    // Join promises
            data.players = values
            return data
        })
    })
}

function setupWarlog() {    // Get basic warlog for clan as json
    return client.clanWarlogByTag(setup.clan_tag).then(res => {

        var data = {}

        data.warlog = []
        data.warleague = []

        for (var i of res.items) {

            toAdd = {
                result: i.result == null ? "-" : i.result,
                endtime: parseTime(i.endTime),
                clan: {
                    level: i.clan.clanLevel,
                    attacks: i.clan.attacks,
                    stars: i.clan.stars,
                    destruction: i.clan.destructionPercentage
                },
            }

            if (i.opponent.name !== undefined) {    // Normal war
                toAdd.opponent = {
                    name: i.opponent.name,
                    tag: i.opponent.tag,
                    level: i.opponent.clanLevel,
                    attacks: i.opponent.attacks,
                    stars: i.opponent.stars,
                    destruction: i.opponent.destructionPercentage
                }
                data.warlog.push(toAdd)
            } else {                                // War league
                data.warleague.push(toAdd)
            }
        }

        return data
    })
}

function createIfNotExists(filename, setupFcn) {
    loadFile('./' + filename).catch((err) => {  // Attempt to load file; execute code on failure
        console.log(`Creating file: ${filename}`)
        setupFcn().then((res2) => {
            console.log(res2)
            fs.writeFile(filename, JSON.stringify(res2, null, 2), 'utf8')
        })
    })
}

function firstTimeSetup() {
    createIfNotExists('clan.json', setupClan)
    createIfNotExists('warlog_basic.json', setupWarlog)
}

function initialize() {
    if (setup === undefined) {
        clanTag = '#J0RYJQJU'
    } else {
        clanTag = setup.clan_tag
    }
}

//firstTimeSetup()
getWarLeagueInfo().then((res) => {
    console.log(res)
    console.log(res.rounds)
    for (var a of res.rounds){
        console.log(a)
    }
}).catch((err) => {console.log(err) })//.catch((err) => { console.log("Please wait until war is on Battle Day") })

// var loadFiles = new Promise((resolve, reject) => {
//     console.log("here2")
//     player_data = loadFile('./players.json')
//     clan_data = loadFile('./clan.json')
//     resolve()
// })

/*loadFiles.then(function (res) {
    console.log("here")
    firstTimeSetup()
}, (err) => { console.log(err) })*/
