import {candidatesQueue, userRegistry} from './one2one';
import {getKurentoClient} from '../../getKurentoClient'
import * as kurento from 'kurento-client';

export class CallMediaPipeline {
    // pipelrsndpoint;

    constructor() {
        this.pipeline = null;
        this.webRtcEndpoint = {};
    }

    createPipeline(callerId, calleeId, ws, callback) {
        var self = this;
        getKurentoClient(function(error, kurentoClient) {
            if (error) {
                return callback(error);
            }

            kurentoClient.create('MediaPipeline', function(error, pipeline) {
                if (error) {
                    return callback(error);
                }

                pipeline.create('WebRtcEndpoint', function(error, callerWebRtcEndpoint) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }

                    if (candidatesQueue[callerId]) {
                        while(candidatesQueue[callerId].length) {
                            var candidate = candidatesQueue[callerId].shift();
                            callerWebRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    callerWebRtcEndpoint.on('OnIceCandidate', function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        userRegistry.getById(callerId).ws.send(JSON.stringify({
                            id : 'iceCandidate',
                            candidate : candidate
                        }));
                    });

                    pipeline.create('WebRtcEndpoint', function(error, calleeWebRtcEndpoint) {
                        if (error) {
                            pipeline.release();
                            return callback(error);
                        }

                        if (candidatesQueue[calleeId]) {
                            while(candidatesQueue[calleeId].length) {
                                var candidate = candidatesQueue[calleeId].shift();
                                calleeWebRtcEndpoint.addIceCandidate(candidate);
                            }
                        }

                        calleeWebRtcEndpoint.on('OnIceCandidate', function(event) {
                            var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                            userRegistry.getById(calleeId).ws.send(JSON.stringify({
                                id : 'iceCandidate',
                                candidate : candidate
                            }));
                        });

                        callerWebRtcEndpoint.connect(calleeWebRtcEndpoint, function(error) {
                            if (error) {
                                pipeline.release();
                                return callback(error);
                            }

                            calleeWebRtcEndpoint.connect(callerWebRtcEndpoint, function(error) {
                                if (error) {
                                    pipeline.release();
                                    return callback(error);
                                }
                            });

                            self.pipeline = pipeline;
                            self.webRtcEndpoint[callerId] = callerWebRtcEndpoint;
                            self.webRtcEndpoint[calleeId] = calleeWebRtcEndpoint;
                            callback(null);
                        });
                    });
                });
            });
        })
    }

    generateSdpAnswer(id, sdpOffer, callback) {
        this.webRtcEndpoint[id].processOffer(sdpOffer, callback);
        this.webRtcEndpoint[id].gatherCandidates(function(error) {
            if (error) {
                return callback(error);
            }
        });
    }

    release() {
        if (this.pipeline) this.pipeline.release();
        this.pipeline = null;
    }
}



