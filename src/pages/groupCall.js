import $ from 'jquery';
import {WebRtcPeer} from 'kurento-utils'

let ws = new WebSocket('wss://' + location.host + '/groupCall');
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
            name: 'name'
        });
        $step1.hide();
        $step2.show();
        $me.find('span').text(name);
        const options = {
            localVideo : $me.find('video')[0],
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
    })
})

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