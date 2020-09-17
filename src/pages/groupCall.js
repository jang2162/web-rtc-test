import $ from 'jquery';
import {WebRtcPeer} from 'kurento-utils'

let ws = new WebSocket('wss://' + location.host + '/group-call');
let webRtcPeer = null;
let sdpOffer = null;
let $step1;
let $nameInp;
let $nameOk;
let $step2;
let $createRoom;
let $rooms;
let $chat;
let $me;
let $meVideo;
let $streams;
$(function () {
    $step1 = $("#step1");
    $nameInp = $("#nameInp");
    $nameOk = $("#nameOk");
    $step2 = $("#step2").hide();
    $createRoom = $("#createRoom").prop('disabled', true);
    $rooms = $("#rooms");
    $chat = $("#chat");
    $me = $("#me");
    $meVideo = $me.find('video');
    $streams = $("#streams");

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
                $createRoom.prop('disabled', false);
            });
        });
        $meVideo[0].play();
    });

    $createRoom.on('click', function () {
        sendMessage({
            id : 'createRoom',
            sdpOffer
        });
        $(this).remove();
    });

    $rooms.on('click', 'li>button', function () {
        const roomId = $(this).data('room-id');
        sendMessage({
            id : 'join',
            sdpOffer,
            roomId
        });
    })
})

window.onbeforeunload = function() {
    ws.close();
}

ws.onmessage = function(message) {
    const parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);
    switch (parsedMessage.id) {
        case 'newRooms':
            newRooms(parsedMessage.rooms);
            break;
        case 'registerResponse':
            newRooms(parsedMessage.rooms);
            break;
        case 'join':
            console.log(parsedMessage);
            break;

        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function newRooms(rooms) {
    $rooms.html("");
    for (const room of rooms) {
        $rooms.append(
            $("<li/>").append([
                $("<span/>").html(room.name),
                $("<button/>").text('join').data('room-id', room.id)
            ])
        )
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