import {WebRtcPeer} from 'kurento-utils'

const ws = new WebSocket('wss://' + location.host + '/one2many');
let video;
let webRtcPeer;

ws.onopen = function () {
    console.log('0.Socket Connected');
    sendMessage({
        id: 'init',
        value: 'many2many'
    })
}

window.onload = function() {
    video = document.getElementById('video');

    document.getElementById('call').addEventListener('click', function() { presenter(); } );
    document.getElementById('viewer').addEventListener('click', function() { viewer(); } );
    document.getElementById('terminate').addEventListener('click', function() { stop(); } );
}

window.onbeforeunload = function() {
    ws.close();
}

ws.onmessage = function(message) {
    const parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);

    switch (parsedMessage.id) {
        case 'presenterResponse':
            presenterResponse(parsedMessage);
            break;
        case 'viewerResponse':
            viewerResponse(parsedMessage);
            break;
        case 'stopCommunication':
            dispose();
            break;
        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function presenterResponse(message) {
    if (message.response != 'accepted') {
        const errorMsg = message.message ? message.message : 'Unknow error';
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {
        webRtcPeer.processAnswer(message.sdpAnswer);
    }
}

function viewerResponse(message) {
    if (message.response != 'accepted') {
        const errorMsg = message.message ? message.message : 'Unknow error';
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {
        webRtcPeer.processAnswer(message.sdpAnswer);
    }
}

function presenter() {
    if (!webRtcPeer) {
        const options = {
            localVideo: video,
            onicecandidate : onIceCandidate
        }

        webRtcPeer = WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
            if(error) return console.error(error);

            this.generateOffer(onOfferPresenter);
        });
    }
}

function onOfferPresenter(error, offerSdp) {
    if (error) return console.error(error);

    const message = {
        id : 'presenter',
        sdpOffer : offerSdp
    };
    sendMessage(message);
}

function viewer() {
    if (!webRtcPeer) {
        const options = {
            remoteVideo: video,
            onicecandidate : onIceCandidate
        }

        webRtcPeer = WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
            if(error) return console.error(error);

            this.generateOffer(onOfferViewer);
        });
    }
}

function onOfferViewer(error, offerSdp) {
    if (error) return console.error(error)

    const message = {
        id : 'viewer',
        sdpOffer : offerSdp
    }
    sendMessage(message);
}

function onIceCandidate(candidate) {
    console.log('Local candidate' + JSON.stringify(candidate));

    const message = {
        id : 'onIceCandidate',
        candidate : candidate
    }
    sendMessage(message);
}

function stop() {
    if (webRtcPeer) {
        const message = {
            id : 'stop'
        }
        sendMessage(message);
        dispose();
    }
}

function dispose() {
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;
    }
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    console.log('Sending message: ' + jsonMessage);
    ws.send(jsonMessage);
}
