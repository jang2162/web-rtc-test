import * as kurento from 'kurento-client';
import {getKurentoClient} from '../../getKurentoClient'


let idCounter = 0;
const candidatesQueue = {};
let presenter = null;
let viewers = [];
const noPresenterMessage = 'No active presenter. Try again later...';

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}
export function many2manyWs(ws) {
    const sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message) {
        const message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
            case 'presenter':
                startPresenter(sessionId, ws, message.sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        return ws.send(JSON.stringify({
                            id : 'presenterResponse',
                            response : 'rejected',
                            message : error
                        }));
                    }
                    ws.send(JSON.stringify({
                        id : 'presenterResponse',
                        response : 'accepted',
                        sdpAnswer : sdpAnswer
                    }));
                });
                break;

            case 'viewer':
                startViewer(sessionId, ws, message.sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        return ws.send(JSON.stringify({
                            id : 'viewerResponse',
                            response : 'rejected',
                            message : error
                        }));
                    }

                    ws.send(JSON.stringify({
                        id : 'viewerResponse',
                        response : 'accepted',
                        sdpAnswer : sdpAnswer
                    }));
                });
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
}


function startPresenter(sessionId, ws, sdpOffer, callback) {
    clearCandidatesQueue(sessionId);

    if (presenter !== null) {
        stop(sessionId);
        return callback("Another user is currently acting as presenter. Try again later ...");
    }

    presenter = {
        id : sessionId,
        pipeline : null,
        webRtcEndpoint : null
    }

    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            stop(sessionId);
            return callback(error);
        }

        if (presenter === null) {
            stop(sessionId);
            return callback(noPresenterMessage);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                stop(sessionId);
                return callback(error);
            }

            if (presenter === null) {
                stop(sessionId);
                return callback(noPresenterMessage);
            }

            presenter.pipeline = pipeline;
            pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
                if (error) {
                    stop(sessionId);
                    return callback(error);
                }

                if (presenter === null) {
                    stop(sessionId);
                    return callback(noPresenterMessage);
                }

                presenter.webRtcEndpoint = webRtcEndpoint;

                if (candidatesQueue[sessionId]) {
                    while(candidatesQueue[sessionId].length) {
                        const candidate = candidatesQueue[sessionId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    const candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        candidate : candidate
                    }));
                });

                webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }

                    if (presenter === null) {
                        stop(sessionId);
                        return callback(noPresenterMessage);
                    }

                    callback(null, sdpAnswer);
                });

                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }
                });
            });
        });
    });
}

function startViewer(sessionId, ws, sdpOffer, callback) {
    clearCandidatesQueue(sessionId);

    if (presenter === null) {
        stop(sessionId);
        return callback(noPresenterMessage);
    }

    presenter.pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
        if (error) {
            stop(sessionId);
            return callback(error);
        }
        viewers[sessionId] = {
            "webRtcEndpoint" : webRtcEndpoint,
            "ws" : ws
        }

        if (presenter === null) {
            stop(sessionId);
            return callback(noPresenterMessage);
        }

        if (candidatesQueue[sessionId]) {
            while(candidatesQueue[sessionId].length) {
                const candidate = candidatesQueue[sessionId].shift();
                webRtcEndpoint.addIceCandidate(candidate);
            }
        }

        webRtcEndpoint.on('OnIceCandidate', function(event) {
            const candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            ws.send(JSON.stringify({
                id : 'iceCandidate',
                candidate : candidate
            }));
        });

        webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
            if (error) {
                stop(sessionId);
                return callback(error);
            }
            if (presenter === null) {
                stop(sessionId);
                return callback(noPresenterMessage);
            }

            presenter.webRtcEndpoint.connect(webRtcEndpoint, function(error) {
                if (error) {
                    stop(sessionId);
                    return callback(error);
                }
                if (presenter === null) {
                    stop(sessionId);
                    return callback(noPresenterMessage);
                }

                callback(null, sdpAnswer);
                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }
                });
            });
        });
    });
}


function onIceCandidate(sessionId, _candidate) {
    const candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpoint) {
        console.info('Sending presenter candidate');
        presenter.webRtcEndpoint.addIceCandidate(candidate);
    }
    else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
        console.info('Sending viewer candidate');
        viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}
function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function stop(sessionId) {
    if (presenter !== null && presenter.id == sessionId) {
        for (const i in viewers) {
            const viewer = viewers[i];
            if (viewer.ws) {
                viewer.ws.send(JSON.stringify({
                    id : 'stopCommunication'
                }));
            }
        }
        presenter.pipeline.release();
        presenter = null;
        viewers = [];

    } else if (viewers[sessionId]) {
        viewers[sessionId].webRtcEndpoint.release();
        delete viewers[sessionId];
    }

    clearCandidatesQueue(sessionId);
    if (viewers.length < 1 && !presenter) {
        console.log('Closing kurento client');
        getKurentoClient(function (_, kurentoClient) {
            kurentoClient.close();
            kurentoClient = null;
        })
    }
}