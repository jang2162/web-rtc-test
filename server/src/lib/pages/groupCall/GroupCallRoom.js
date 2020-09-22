import {getKurentoClient} from '../../getKurentoClient'
import {userRegistry} from './groupCallWs'
import * as kurento from 'kurento-client';

export class GroupCallRoom {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.pipeline = null;
        this.userDataList = [];
        this.candidatesQueue = {};
    }

    async addUser(user, sendSdpOffer) {
        console.log('4. AddUser');
        if (!this.pipeline) {
            this.pipeline = await this.createPipeLine();
        }
        console.log('4.1. CreateWebRtcEndpoint');
        const webEndPoint = await this.createWebRtcEndpoint(user.id);
        console.log('4.2. GenerateSendSdpAnswer');
        const sdpAnswer = await this.generateSdpAnswer(webEndPoint, sendSdpOffer);
        const userData = {
            user,
            sdpAnswer,
            webEndPoint,
            sendSdpOffer,
            endPoints: []
        }

        for (const userDataA of this.userDataList) {
            // userDataA.user.ws.send(JSON.stringify({
            //     id: 'join',
            //     roomId: this.id,
            //     user: {
            //         id: userData.user.id,
            //         name: userData.user.name
            //     }
            // }));
        }

        console.log('4.3. join response ' + sdpAnswer);
        userData.user.ws.send(JSON.stringify({
            id: 'joinResponse',
            roomId: this.id,
            name: this.name,
            sdpAnswer,
            users: this.userDataList.map(item => (
                {
                    user: {
                        id: item.user.id,
                        name: item.user.name,
                    },
                }
            ))
        }))
        this.userDataList.push(userData);
    }

    connect(userId, presenterId, sdpOffer) {
        return new Promise(async (resolve, reject) => {
            const userData = this.userDataList.find(item => item.user.id == userId);
            const presenterUserData = this.userDataList.find(item => item.user.id == presenterId);
            try {
                const endpoint = await this.createWebRtcEndpoint(userId, presenterId);
                const sdpAnswer = await this.generateSdpAnswer(endpoint, sdpOffer);
                await this.connectWebRtcEndpoint(presenterUserData.webEndPoint, endpoint);
                userData.endPoints.push({
                    user: presenterUserData.user,
                    endpoint,
                    sdpAnswer
                });
                resolve(sdpAnswer);
            } catch (e) {
                reject(e);
                this.pipeline.release();
            }

        })
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
        console.log('4.0. CreatePipeLine');
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

    async createWebRtcEndpoint(userId, key) {

        return new Promise((resolve, reject) => {
            this.pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
                if (error) {
                    return reject(error);
                }

                console.log('\t shift candidatesQueue ' + userId + '  ' + key);
                if (this.candidatesQueue[userId]) {
                    if (!key) {
                        key = 0;
                    }

                    if (this.candidatesQueue[userId][key]) {
                        while(this.candidatesQueue[userId][key].length) {
                            const candidate = this.candidatesQueue[userId][key].shift();
                            console.log('\t\t add candidatesQueue ' + userId + '  ' + key + '  ' + candidate);
                            webRtcEndpoint.addIceCandidate(candidate);
                        }
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    const candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    console.log('\t on ice candidatesQueue ' + userId + '  ' + key + '  ' + candidate);
                    userRegistry.getById(userId).ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        key,
                        roomId: this.id,
                        candidate : candidate
                    }));
                });
                resolve(webRtcEndpoint);

            });
        })
    }

    addIceCandidate(id, key, candidate) {
        const userData = this.userDataList.find(item => item.user.id == id);
        if (userData) {
            if (key) {
                const endpointData = userData.endPoints.find(item => item.user.id == key);
                if (endpointData) {
                    endpointData.endpoint.addIceCandidate(candidate);
                }
            } else {
                userData.webEndPoint.addIceCandidate(candidate);
            }
        } else {
            if (!this.candidatesQueue[id]) {
                this.candidatesQueue[id] = {};
            }

            if (!key) {
                key = 0;
            }
            if (!this.candidatesQueue[id][key]) {
                this.candidatesQueue[id][key] = [];
            }
            this.candidatesQueue[id][key].push(candidate);
        }
    }

    clearCandidatesQueue(sessionId) {
        if (this.candidatesQueue[sessionId]) {
            delete this.candidatesQueue[sessionId];
        }
    }
}