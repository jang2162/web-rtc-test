import {getKurentoClient} from '../../getKurentoClient'
import {candidatesQueue, userRegistry} from './groupCallWs'
import * as kurento from 'kurento-client';

export class GroupCallRoom {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.pipeline = null;
        this.userDataList = [];
    }

    async addUser(user, sdpOffer) {
        if (!this.pipeline) {
            this.pipeline = await this.createPipeLine();
        }

        const userData = {
            user,
            sdpOffer,
            endpoints: []
        }

        for (const userDataA of this.userDataList) {
            const sdpAnswer = await this.connect(userDataA, userData);
            userDataA.user.ws.send(JSON.stringify({
                id: 'join',
                roomId: this.id,
                sdpAnswer,
                user: {
                    id: userData.user.id,
                    name: userData.user.name
                }
            }));
        }

        if (this.userDataList.length > 0) {
            userData.user.ws.send({
                id: 'joinResponse',
                roomId: this.id,
                name: this.name,
                users: userData.endpoints.map(item => (
                    {
                        user: {
                            id: item.user.id,
                            name: item.user.name,
                        },
                        sdpAnswer: item.sdpAnswer
                    }
                ))
            })
        }

        this.userDataList.push(userData);
    }


    connect(userDataA, userDataB) {
        return new Promise(async (resolve, reject) => {
            try {
                const webEndPointA = await this.createWebRtcEndpoint(userDataA.user.id);
                const webEndPointB = await this.createWebRtcEndpoint(userDataB.user.id);
                await this.connectWebRtcEndpoint(webEndPointA, webEndPointB);
                await this.connectWebRtcEndpoint(webEndPointB, webEndPointA);
                const sdpAnswerA = await this.generateSdpAnswer(webEndPointA, userDataA.sdpOffer)
                const sdpAnswerB = await this.generateSdpAnswer(webEndPointB, userDataB.sdpOffer)

                userDataA.endpoints.push({
                    user: userDataB.user,
                    endpoint: webEndPointA,
                    sdpAnswer: sdpAnswerA
                });

                userDataB.endpoints.push({
                    user: userDataA.user,
                    endpoint: webEndPointB,
                    sdpAnswer: sdpAnswerB
                });
                resolve(sdpAnswerA);
            } catch (e) {
                reject(e);
                this.pipeline.release();
            }
        });
    }

    connectWebRtcEndpoint(a, b) {
        return new Promise(async (resolve, reject) => {
            a.connect(b, (error) => {
                if (error) {
                    return reject(error);
                }
                resolve();
            });
        });
    }

    generateSdpAnswer(webEndPoint, sdpOffer) {
        return new Promise((resolve, reject) => {
            webEndPoint.processOffer(sdpOffer, function (error, sdpAnswer) {
                if (error) {
                    return reject(error, error);
                }
                resolve(sdpAnswer);
            });
            webEndPoint.gatherCandidates(function(error) {
                if (error) {
                    return reject(error);
                }
            });
        })
    }

    createPipeLine() {
        return new Promise((resolve, reject) => {
            getKurentoClient(function(error, kurentoClient) {
                if (error) {
                    return reject(error);
                }

                kurentoClient.create('MediaPipeline', function(error, pipeline) {
                    if (error) {
                        return reject(error);
                    }
                    resolve(pipeline);
                })
            })
        })
    }

    async createWebRtcEndpoint(userId) {
        return new Promise((resolve, reject) => {
            this.pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
                if (error) {
                    return reject(error);
                }

                if (candidatesQueue[userId]) {
                    while(candidatesQueue[userId].length) {
                        const candidate = candidatesQueue[userId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    const candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    userRegistry.getById(userId).ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        candidate : candidate
                    }));
                });
                resolve(webRtcEndpoint);

            });
        })
    }

    addIceCandidate(id, candidate) {
        const userData = this.userDataList.find(item => item.user.id == id);
        if (userData) {
            for (const point of userData.endPoints) {
                point.endpoint.addIceCandidate(candidate);
            }
        }
    }
}