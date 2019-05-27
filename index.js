var clashApi = require('clash-of-clans-api')
var fs = require('file-system')

require('dotenv').config()

const setup = require('./setup.json')

function loadFile(name) {
    return new Promise((resolve) => {
        fs.readFile(name, 'utf8', (err, data) => {
            resolve(JSON.parse(data))
        })
    })
}

var client = clashApi({
    token: process.env.COC_API_KEY
})

client.clanCurrentWarByTag(setup.clan_tag).then(res => {
    var endTime = res.endTime
    var endTime_D = parseTime(endTime)

    //console.log(endTime_D.valueOf())

    var endTime_before = new Date(endTime_D.valueOf() - 60000) // One minute before the end of the war

    //console.log(endTime_before.toJSON())

    var curTime = new Date(Date.now())
    //console.log(curTime)

    var timeRemaining = endTime_D - curTime
    //console.log(timeRemaining)

}).catch((err) => console.log("Current war data is unavailable. Please make your war log public!"))

function parseTime(t) {
    return new Date(Date.UTC(
        t.substr(0, 4),   // yr
        t.substr(4, 2) - 1,   // mo
        t.substr(6, 2),   // day
        t.substr(9, 2),   // hr
        t.substr(11, 2),  // min
        t.substr(13, 2)   // sec
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

        //fs.writeFile('clan_prev.json', JSON.stringify(clan_data, null, 2), 'utf8') // Just in case you accidentally over-wrote stuff
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

function firstTimeSetup() {

    loadFile('./players.json').then((res) => {
        if (res !== '{}') {
            setupClan.then((res2) => {
                console.log(res2)
                fs.writeFile('players.json', JSON.stringify(res2, null, 2), 'utf8')
            })
        }
    }).catch((err) => console.log(err))

    loadFile('./clan.json').then((res) => {
        if (res !== '{}') {
            setupWarlog.then((res2) => {
                fs.writeFile('clan.json', JSON.stringify(res2, null, 2), 'utf8')
            })
        }
    }).catch((err) => console.log(err))
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
