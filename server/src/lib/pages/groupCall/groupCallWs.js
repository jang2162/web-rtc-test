import * as kurento from 'kurento-client';
import {UserSession} from './UserSession'
import {UserRegistry} from './UserRegistry'
import {GroupCallRoom} from './GroupCallRoom'

const userRegistry = new UserRegistry();
const rooms = [];
let idCounter = 0;

export function groupCallWs(ws) {
    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
        userRegistry.unregister(sessionId);
    });

    ws.on('message', async function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
            case 'register':
                register(sessionId, message.name, ws);
                break;

            case 'createRoom':
                await createRoom(sessionId, message.sdpOffer, ws);
                break;
            case 'join':
                await join(sessionId, message.sdpOffer, message.roomId, ws);
                break;
            case 'connect':
                await connect(sessionId, message.sdpOffer, message.roomId, message.userId, ws);
                break;
            case 'stop':
                stop(sessionId);
                break;

            case 'onIceCandidate':
                onIceCandidate(sessionId, message.roomId, message.key, message.candidate);
                break;

            default:
                ws.send(JSON.stringify({
                    id : 'error',
                    message : 'Invalid message ' + message
                }));
                break;
        }
    });
}

function stop(sessionId) {
    // if (!pipelines[sessionId]) {
    //     return;
    // }
    //
    // var pipeline = pipelines[sessionId];
    // delete pipelines[sessionId];
    // pipeline.release();
    // var stopperUser = userRegistry.getById(sessionId);
    // var stoppedUser = userRegistry.getByName(stopperUser.peer);
    // stopperUser.peer = null;
    //
    // if (stoppedUser) {
    //     stoppedUser.peer = null;
    //     delete pipelines[stoppedUser.id];
    //     var message = {
    //         id: 'stopCommunication',
    //         message: 'remote user hanged out'
    //     }
    //     stoppedUser.sendMessage(message)
    // }
    const user = userRegistry.getById(sessionId);
    for (const room of user.rooms) {
        room.clearCandidatesQueue(sessionId);
    }
}

function register(id, name, ws, callback) {
    function onError(error) {
        ws.send(JSON.stringify({id:'registerResponse', response : 'rejected ', message: error}));
    }

    if (!name) {
        return onError("empty user name");
    }

    if (userRegistry.getByName(name)) {
        return onError("User " + name + " is already registered");
    }

    userRegistry.register(new UserSession(id, name, ws));
    try {
        ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted', rooms}));
    } catch(exception) {
        onError(exception);
    }
}

async function createRoom(id, sdpOffer, ws) {
    const user = userRegistry.getById(id);
    user.joined = true;
    const roomId = id + '-' + new Date().getTime();
    const name = user.name + '-' + roomId;
    const room = new GroupCallRoom(roomId, name);
    rooms.push(room)
    await room.addUser(user, sdpOffer);
    user.rooms.push(room);

    for (const i in userRegistry.usersById) {
        if (userRegistry.usersById[i].joined) {
            continue;
        }

        userRegistry.usersById[i].ws.send(JSON.stringify({
            id: 'newRooms',
            rooms: rooms.map(item => ({
                id: item.id,
                name: item.name
            }))
        }))
    }
}

async function join(id, sdpOffer, roomId, ws) {
    const room = rooms.find(item => item.id === roomId);
    if (!room) {

        ws.send(JSON.stringify({
            id: 'joinResponse',
            error: 'roomNotFound'
        }));
    }
    const user = userRegistry.getById(id);
    user.joined = true;
    await room.addUser(user, sdpOffer);
    user.rooms.push(room);
}

async function connect(id, sdpOffer, roomId, userId, ws) {
    const room = rooms.find(item => item.id === roomId);
    if (!room) {
        ws.send(JSON.stringify({
            id: 'connectResponse',
            error: 'roomNotFound'
        }));
    }

    const sdpAnswer = await room.connect(id, userId, sdpOffer);
    ws.send(JSON.stringify({
        id: 'connectResponse',
        roomId,
        userId,
        sdpAnswer
    }));
}

function onIceCandidate(sessionId, roomId, key, _candidate) {
    const candidate = kurento.getComplexType('IceCandidate')(_candidate);
    const user = userRegistry.getById(sessionId);
    const room = rooms.find(item => item.id === roomId);
    if (room) {
        room.addIceCandidate(user.id, key, candidate);
    }
}

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

export {
    userRegistry
}

