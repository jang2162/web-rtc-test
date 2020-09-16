import $ from 'jquery';
import {WebRtcPeer} from 'kurento-utils'

let ws = new WebSocket('wss://' + location.host + '/group-call');
let webRtcPeer = null;
let sdpOffer = null;

$(function () {
    const $step1 = $("#step1");
    const $nameInp = $("#nameInp");
    const $nameOk = $("#nameOk");
    const $step2 = $("#step2").hide();
    const $createRoom = $("#createRoom");
    const $rooms = $("#rooms");
    const $chat = $("#chat");
    const $me = $("#me");
    const $meVideo = $me.find('video');
    const $streams = $("#streams");

    $nameOk.on('click',function () {
        const name = $nameInp.val().trim();
        if (!name) {
            alert("이름을 입력하세요");
            $nameInp.trigger('focus');
            return;
        }
        sendMessage({
            id: 'register',
            name
        });
        $step1.hide();
        $step2.show();
        $me.find('span').text(name);
        const options = {
            localVideo : $meVideo[0],
            onicecandidate : onIceCandidate
        }

        webRtcPeer = WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
            if (error) {
                console.error(error);
            }

            this.generateOffer(function(error, offerSdp) {
                if (error) {
                    console.error(error);
                    alert(error);
                    return;
                }
                sdpOffer = offerSdp;
            });
        });
        $meVideo[0].play();
    });

    $createRoom.on('click', function () {
        sendMessage({
            id : 'createRoom'
        });
    });
})

window.onbeforeunload = function() {
    ws.close();
}

ws.onmessage = function(message) {
    const parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);

    switch (parsedMessage.id) {
        case 'newRooms':
            console.log(parsedMessage);
            break;

        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function onIceCandidate(candidate) {
    console.log('Local candidate' + JSON.stringify(candidate));
    sendMessage({
        id : 'onIceCandidate',
        candidate : candidate
    });
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    console.log('Sending message: ' + jsonMessage);
    ws.send(jsonMessage);
}