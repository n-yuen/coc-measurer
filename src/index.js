var clashApi = require('clash-of-clans-api')
var fs = require('file-system')
var Bottleneck = require("bottleneck")

//  "clan_tag": "#J0RYJQJU"

const setup = require('./setup.json')
require('dotenv').config()

var clanData, warlogData
var clanFilename = 'clan.json'
var PATH = '../data/'

const client = clashApi({
    token: process.env.COC_API_KEY
})

const limiter = new Bottleneck({
    minTime: 200
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
    getEndTime.then(res => {
        setTimeout(updateWarResults, res - Date.now())
    }).catch(err => console.log(err))
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
    console.log('Getting war league info...')
    return client.clanLeague(setup.clan_tag).then(res => {
        //var promises = []
        var wars = []
        var data = {
            season: new Date(Date.UTC(
                res.season.substr(0, 4),
                res.season.substr(5, 2) - 1)),
            wars: []
        }
        for (var r of res.rounds) {
            if (r.warTags[0] != '#0') {     // War hasn't happened yet
                wars = wars.concat(r.warTags)
            }
        }

        return Promise.all(wars.map(w => {

            return limiter.wrap(() => {     // Rate limit to not get throttled
                return client.clanLeagueWars(w)

            })().then(res2 => {
                //console.log(res2)
                if (res2.state != 'preparation') {
                    var info

                    // Find out which side we're on
                    if (res2.clan.tag == setup.clan_tag) {
                        info = getWarInfo(res2, true)

                    } else if (res2.opponent.tag == setup.clan_tag) {
                        info = getWarInfo(res2, false)
                    } else {
                        return
                    }
                    data.wars.push(info)
                    return processWarInfo(info, true)
                }
            }).catch(err => { console.log(err) })

        })).then((values) => {    // Join promises
            for (var v of values){
                if (v !== undefined){
                    logWarActivity(v)
                }
            }
            return data
        }).catch(err => { console.log(err) })

    }).catch(err => { console.log(err) })
}

// Insert the relevant data into clanData
function logWarActivity(data) {
    for (var a of data.attacks){
        clanData.members[a.tag].attacks.push(a.info)
    }
    for (var d of data.defenses){
        clanData.members[d.tag].defenses.push(d.info)
    }
}


// Taking input from a war log object, parse it into an object where attacks and defenses
// can be easily processed.
async function processWarInfo(war, isLeague) {
    var data = {
        attacks: [],
        defenses: []
    }

    var promises = []
    // Add to the player database
    for (var m of war.members) {
        if (clanData.members[m.tag] !== undefined) {
            promises.push(getPlayerInfo(m.tag))
        }
    }

    try {
        const values = await Promise.all(promises)
        for (var v of values) {
            clanData.members[v.tag] = v.info
        }
        for (var m of war.members) {
            //var member = 
            //data.tag = m.tag
            for (var a of m.attacks) {

                data.attacks.push({
                    tag: m.tag,
                    info: {
                        th: m.th,
                        position: m.position,
                        stars: a.stars,
                        newStars: a.newStars,
                        opponentTag: a.opponentTag,
                        opponentPosition: a.position,
                        opponentTh: a.opponentTh,
                        destruction: a.destruction,
                        war: war.endTime,
                        warType: isLeague ? "league" : "standard"
                    }
                })
            }
            for (var d of m.defenses) {
                data.defenses.push({
                    tag: m.tag,
                    info: {
                        th: m.th,
                        position: m.position,
                        stars: d.stars,
                        opponentTag: d.opponentTag,
                        opponentPosition: d.position,
                        opponentTh: a.opponentTh,
                        destruction: d.destruction,
                        war: war.endTime,
                        warType: isLeague ? "league" : "standard"
                    }
                })
            }
        }
        return data
    }
    catch (err) {
        console.log(err)
    }
}

// Get detailed war info, and return as an object that's ready to be written to disk.
function getWarInfo(war, isPlayer) {

    if (war === undefined)
        throw 'invalid war'

    if (war.state == 'preparation')
        throw 'prep day'

    // Get the correct side that we're on
    var clan, opponent
    if (isPlayer) {
        clan = war.clan
        opponent = war.opponent
    } else {
        clan = war.opponent
        opponent = war.clan
    }

    var data = {
        endTime: parseTime(war.endTime),
        clanLevel: clan.clanLevel,
        attacks: clan.attacks,
        stars: clan.stars,
        destruction: clan.destructionPercentage, // This is messed up, find a fix
        members: []
    }

    // Find member by tag
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
            position: member.mapPosition,
            attacks: [],
            defenses: []
        }

        // Get detailed attack info
        if (member.attacks !== undefined) {
            for (var a of member.attacks) {
                var defender = findMember(opponent, a.defenderTag)
                a.opponentTh = defender.townhallLevel
                a.position = defender.mapPosition
            }

            toAdd.attacks = member.attacks
            all_attacks = all_attacks.concat(member.attacks)
        }

        data.members.push(toAdd)
    }

    // Get detailed defense info
    for (var opp of opponent.members) {
        if (opp.attacks !== undefined) {
            for (var a of opp.attacks) {
                var defender = findMember(data, a.defenderTag)
                a.opponentTh = opp.townhallLevel
                a.position = opp.mapPosition
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

    for (var m of data.members) {    // Removing extraneous info & rename to fit naming scheme
        for (var a of m.attacks) {
            a.destruction = a.destructionPercentage
            a.opponentTag = a.defenderTag
            delete a.defenderTag
            delete a.destructionPercentage
            delete a.attackerTag
        }
        for (var d of m.defenses) {
            d.destruction = d.destructionPercentage
            d.opponentTag = d.attackerTag
            delete d.attackerTag
            delete d.destructionPercentage
            delete d.defenderTag
        }
    }

    data.members.sort((a, b) => {
        return a.position - b.position
    })

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
    })
}

function getPlayerInfo(tag) {
    return client.playerByTag(tag).then(res => {
        return {
            tag: res.tag,
            info: {
                name: res.name,
                th: res.townHallLevel,
                rank: res.role == 'admin' ? 'elder' : res.role,
                stars: res.warStars,
                level: res.expLevel,
                wars_participated: 0,
                attacks: [],
                defenses: []
            }
        }
    })
}

function setupClan() {  // get object containing clan and players
    return client.clanByTag(setup.clan_tag).then(res => {
        var data = {
            members: {}
        }
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
            promises.push(getPlayerInfo(m.tag))
        }

        return Promise.all(promises).then(values => {    // Join promises
            for (var v of values) {
                data.members[v.tag] = v.info
            }
            return data
        })
    })
}

function setupWarlog() {    // Get basic warlog for clan as object
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
    return loadFile('./' + filename).then(res => {

        return res

    }).catch(() => {  // Attempt to load file; execute code on failure
        console.log(`Creating file: ${filename}`)
        return setupFcn().then(res => {
            fs.writeFile(PATH + filename, JSON.stringify(res, null, 2), 'utf8')
            console.log(`Created file: ${filename}`)
            return res
        })
    })
}

async function firstTimeSetup() {
    const values = await Promise.all([
        createIfNotExists(clanFilename, setupClan),
        createIfNotExists('warlog_basic.json', setupWarlog)
    ])
    //console.log(values)
    clanData = values[0]
    warlogData = values[1]
}

firstTimeSetup().then(() => {
    getWarLeagueInfo().then((res) => {

        var filename = 'warleague06-19.json'
        console.log('Writing war league info to disk...')

        fs.writeFile(PATH + filename, JSON.stringify(res, null, 2), 'utf8')   // Testing, will change later
        console.log(`Finished writing league info at ${filename}`)
        fs.writeFile(PATH + clanFilename, JSON.stringify(clanData, null, 2), 'utf8')

    }).catch(err => { console.log(err) }) //.catch((err) => { console.log("Please wait until war is on Battle Day") })
})
