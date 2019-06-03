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

        var promises = []
        var data = []
        for (var r of res.rounds) {
            if (r.warTags[0] != '#0') {
                for (var w of r.warTags) {
                    promises.push(
                        client.clanLeagueWars(w).then(res2 => {
                            if (res2.state != 'preparation') {
                                if (res2.clan.tag == setup.clan_tag) {
                                    data.push(getWarInfo(res2, true))
                                } else if (res2.opponent.tag == setup.clan_tag) {
                                    data.push(getWarInfo(res2, false))
                                }
                            }
                        })
                    )
                }
            }
        }
        return Promise.all(promises).then((values) => {    // Join promises
            return data
        })

    }).catch((err) => { console.log(err) })
}

function getWarInfo(war, isPlayer) {


    if (war === undefined)
        throw 'invalid war'

    if (war.state == 'preparation')
        throw 'prep day'

    var clan, opponent
    if (isPlayer) {
        clan = war.clan
        opponent = war.opponent
    } else {
        clan = war.opponent
        opponent = war.clan
    }

    var data = {
        clanLevel: clan.clanLevel,
        attacks: clan.attacks,
        stars: clan.stars,
        destruction: clan.destructionPercentage * 2, // Destruction percentage is given as half of "actual" value
        members: []
    }

    //console.log(war)

    function findMember(arr, memberTag) {
        for (var member of arr.members) {
            if (member.tag == memberTag)
                return member
        }
    }

    var all_attacks = []

    // Not optimized: O(n^2), but max 50 elements so performance loss is trivial
    for (var member of clan.members) {
        var toAdd = {
            name: member.name,
            tag: member.tag,
            th: member.townhallLevel,
            attacks: [],
            defenses: []
        }

        if (member.attacks !== undefined) {
            for (var a of member.attacks) {
                a.th = findMember(opponent, a.defenderTag).townhallLevel
            }
            //console.log(member.attacks)
            toAdd.attacks = member.attacks
            all_attacks = all_attacks.concat(member.attacks)
        }

        toAdd.attacksUsed = toAdd.attacks.length
        data.members.push(toAdd)
    }

    // Get detailed defense info
    for (var member of opponent.members) {
        if (member.attacks !== undefined) {
            for (var a of member.attacks) {
                var defender = findMember(data, a.defenderTag)
                a.th = member.townhallLevel
                defender.defenses.push(a)
            }
        }
    }

    all_attacks.sort((a, b) => {
        return (a.order - b.order)
    })

    // Determine number of new stars
    var len = all_attacks.length
    for (var i = 0; i < len; i++) {
        var a = all_attacks[i]
        var prev_stars = 0
        var a2
        for (var z = 0; z < i; z++) {
            a2 = all_attacks[z]
            if (a2.attackerTag == a.attackerTag) {
                prev_stars = Math.max(prev_stars, a2.stars)
            }
        }
        a.newStars = a.stars - prev_stars
    }

    // testing only
    // for (var i = 0; i < data.members.length; i++){
    //     console.log(data.members[i])
    // }
    //console.log(data)
    return data
}

function getCurrentWarInfo() {
    return new Promise((resolve, reject) => {
        client.clanCurrentWarByTag(setup.clan_tag).then(res => {
            return getWarInfo(res, true)
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
            promises.push(client.playerByTag(m.tag).then(res2 => {
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
            }))
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

            var clan = i.clan
            var opponent = i.opponent

            toAdd = {
                result: i.result == null ? "-" : i.result,
                endtime: parseTime(i.endTime),
                clan: {
                    level: clan.clanLevel,
                    attacks: clan.attacks,
                    stars: clan.stars,
                    destruction: clan.destructionPercentage
                },
            }

            if (opponent.name !== undefined) {    // Normal war
                toAdd.opponent = {
                    name: opponent.name,
                    tag: opponent.tag,
                    level: opponent.clanLevel,
                    attacks: opponent.attacks,
                    stars: opponent.stars,
                    destruction: opponent.destructionPercentage
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

//firstTimeSetup()
getWarLeagueInfo().then((res) => {
    console.log(res)
}).catch((err) => { console.log(err) }) //.catch((err) => { console.log("Please wait until war is on Battle Day") })
