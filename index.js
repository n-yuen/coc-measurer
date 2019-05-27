var clashApi = require('clash-of-clans-api')
var fs = require('file-system')

require('dotenv').config()

const setup = require('./setup.json')

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

var client = clashApi({
    token: process.env.COC_API_KEY
})

var getEndTime = client.clanCurrentWarByTag(setup.clan_tag).then(res => {
    return new Date(parseTime(res.endTime).valueOf() - 60000) // One minute before the end of the war
}).catch((err) => console.log(err))

function initialize_war() {
    getEndTime.then((res) => {
        setTimeout(updateWarResults, res - Date.now())
    })
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

var setupClan = new Promise((resolve, reject) => {
    client.clanByTag(setup.clan_tag).then(res => {  // Get clan info
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
        var memberList = res.memberList
        var num_members = res.members
        var player_tag, toAdd

        var promises = []

        for (var i = 0; i < num_members; i++) { // Get detailed player information for each player as promises
            player_tag = memberList[i].tag
            promises[i] = client.playerByTag(player_tag).then(res2 => {
                toAdd = {
                    tag: player_tag,
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

        Promise.all(promises).then((values) => {    // Join promises
            data.players = values
            resolve(data)
        })
    })
})

var setupWarlog = new Promise((resolve, reject) => {
    client.clanWarlogByTag(setup.clan_tag).then(res => {
        api_warlog = res.items

        var data = {}

        data.warlog = []
        data.warleague = []

        var item_len = res.items.length
        for (var i = 0; i < item_len; i++) {
            value = api_warlog[i]

            toAdd = {
                result: value.result == null ? "-" : value.result,
                endtime: parseTime(value.endTime),
                clan: {
                    level: value.clan.clanLevel,
                    attacks: value.clan.attacks,
                    stars: value.clan.stars,
                    destruction: value.clan.destructionPercentage
                },
            }

            if (value.opponent.name !== undefined) {
                toAdd.opponent = {
                    name: value.opponent.name,
                    tag: value.opponent.tag,
                    level: value.opponent.clanLevel,
                    attacks: value.opponent.attacks,
                    stars: value.opponent.stars,
                    destruction: value.opponent.destructionPercentage
                }
                data.warlog.push(toAdd)
            } else {
                data.warleague.push(toAdd)
            }
        }
        resolve(data)
        //console.log(clan)
    })
})

function createIfNotExists(filename, setupPromise){
    loadFile('./' + filename).catch((err) => {  // Attempt to load file; execute code on failure
        console.log(`Creating file: ${filename}`)
        setupPromise.then((res2) => {
            fs.writeFile(filename, JSON.stringify(res2, null, 2), 'utf8')
        })
    })
}

function firstTimeSetup() {
    createIfNotExists('clan.json', setupClan)
    createIfNotExists('warlog.json', setupWarlog)
}

firstTimeSetup()

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
