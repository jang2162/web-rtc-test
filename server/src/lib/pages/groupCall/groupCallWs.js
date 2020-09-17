import * as kurento from 'kurento-client';
import * as ws from 'ws'
import {CallMediaPipeline} from './CallMediaPipeline'
import {UserSession} from './UserSession'
import {UserRegistry} from './UserRegistry'

const userRegistry = new UserRegistry();
const pipelines = {};
const rooms = [];
const candidatesQueue = {};
let idCounter = 0;

export const groupCallWs = (server) => {
    init(
        new ws.Server({
            server,
            path : '/group-call'
        })
    )
}


function init(wss) {
    wss.on('connection', function(ws) {
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

        ws.on('message', function(_message) {
            var message = JSON.parse(_message);
            console.log('Connection ' + sessionId + ' received message ', message);

            switch (message.id) {
                case 'register':
                    register(sessionId, message.name, ws);
                    break;

                case 'createRoom':
                    createRoom(sessionId, message.sdpOffer, ws);
                    break;
                case 'join':
                    join(sessionId, message.sdpOffer, message.roomId, ws);
                    break;

                case 'call':
                    call(sessionId, message.to, message.from, message.sdpOffer);
                    break;

                case 'incomingCallResponse':
                    incomingCallResponse(sessionId, message.from, message.callResponse, message.sdpOffer, ws);
                    break;

                case 'stop':
                    stop(sessionId);
                    break;

                case 'onIceCandidate':
                    onIceCandidate(sessionId, message.candidate);
                    break;

                default:
                    ws.send(JSON.stringify({
                        id : 'error',
                        message : 'Invalid message ' + message
                    }));
                    break;
            }
        });
    });
}

function stop(sessionId) {
    if (!pipelines[sessionId]) {
        return;
    }

    var pipeline = pipelines[sessionId];
    delete pipelines[sessionId];
    pipeline.release();
    var stopperUser = userRegistry.getById(sessionId);
    var stoppedUser = userRegistry.getByName(stopperUser.peer);
    stopperUser.peer = null;

    if (stoppedUser) {
        stoppedUser.peer = null;
        delete pipelines[stoppedUser.id];
        var message = {
            id: 'stopCommunication',
            message: 'remote user hanged out'
        }
        stoppedUser.sendMessage(message)
    }

    clearCandidatesQueue(sessionId);
}

function incomingCallResponse(calleeId, from, callResponse, calleeSdp, ws) {

    clearCandidatesQueue(calleeId);

    function onError(callerReason, calleeReason) {
        if (pipeline) pipeline.release();
        if (caller) {
            var callerMessage = {
                id: 'callResponse',
                response: 'rejected'
            }
            if (callerReason) callerMessage.message = callerReason;
            caller.sendMessage(callerMessage);
        }

        var calleeMessage = {
            id: 'stopCommunication'
        };
        if (calleeReason) calleeMessage.message = calleeReason;
        callee.sendMessage(calleeMessage);
    }

    var callee = userRegistry.getById(calleeId);
    if (!from || !userRegistry.getByName(from)) {
        return onError(null, 'unknown from = ' + from);
    }
    var caller = userRegistry.getByName(from);

    if (callResponse === 'accept') {
        var pipeline = new CallMediaPipeline();
        pipelines[caller.id] = pipeline;
        pipelines[callee.id] = pipeline;

        pipeline.createPipeline(caller.id, callee.id, ws, function(error) {
            if (error) {
                return onError(error, error);
            }

            pipeline.generateSdpAnswer(caller.id, caller.sdpOffer, function(error, callerSdpAnswer) {
                if (error) {
                    return onError(error, error);
                }

                pipeline.generateSdpAnswer(callee.id, calleeSdp, function(error, calleeSdpAnswer) {
                    if (error) {
                        return onError(error, error);
                    }

                    var message = {
                        id: 'startCommunication',
                        sdpAnswer: calleeSdpAnswer
                    };
                    callee.sendMessage(message);

                    message = {
                        id: 'callResponse',
                        response : 'accepted',
                        sdpAnswer: callerSdpAnswer
                    };
                    caller.sendMessage(message);
                });
            });
        });
    } else {
        var decline = {
            id: 'callResponse',
            response: 'rejected',
            message: 'user declined'
        };
        caller.sendMessage(decline);
    }
}

function call(callerId, to, from, sdpOffer) {
    clearCandidatesQueue(callerId);

    var caller = userRegistry.getById(callerId);
    var rejectCause = 'User ' + to + ' is not registered';
    if (userRegistry.getByName(to)) {
        var callee = userRegistry.getByName(to);
        caller.sdpOffer = sdpOffer
        callee.peer = from;
        caller.peer = to;
        var message = {
            id: 'incomingCall',
            from
        };
        try{
            return callee.sendMessage(message);
        } catch(exception) {
            rejectCause = "Error " + exception;
        }
    }
    var message  = {
        id: 'callResponse',
        response: 'rejected: ',
        message: rejectCause
    };
    caller.sendMessage(message);
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

function createRoom(id, sdpOffer, ws) {
    const user = userRegistry.getById(id);
    user.joined = true;
    rooms.push({
        id: id + '-' + new Date().getTime(),
        name: user.name + '-' + id + '-' + new Date().getTime(),
        sdpOffer,
        joinList: [{user, sdpOffer}],
        moderator: id
    });

    for (const i in userRegistry.usersById) {
        if (userRegistry.usersById[i].joined) {
            continue;
        }

        userRegistry.usersById[i].ws.send(JSON.stringify({
            id: 'newRooms',
            rooms
        }))
    }
}

function join(id, sdpOffer, roomId, ws) {
    const user = userRegistry.getById(id);
    const room = rooms.find(item => item.roomId === roomId);
    if (!room) {
        ws.send(JSON.stringify({
            id: 'joinResponse',
            error: 'roomNotFound'
        }));
    }

    ws.send(JSON.stringify({
        id: 'joinResponse',
    }));

    for (const joinInfo of room.joinList) {
        joinInfo.user.ws.send(JSON.stringify({
            id: 'newJoin',
            info: {
                user,
                sdpOffer
            }
        }))
    }

    room.joinList.push({
        user,
        sdpOffer
    });
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var user = userRegistry.getById(sessionId);

    if (pipelines[user.id] && pipelines[user.id].webRtcEndpoint && pipelines[user.id].webRtcEndpoint[user.id]) {
        var webRtcEndpoint = pipelines[user.id].webRtcEndpoint[user.id];
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        if (!candidatesQueue[user.id]) {
            candidatesQueue[user.id] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

export {
    candidatesQueue,
    userRegistry
}

