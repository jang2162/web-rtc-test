import $ from 'jquery';
import {WebRtcPeer} from 'kurento-utils'

let ws = new WebSocket('wss://' + location.host);

ws.onopen = function () {
    console.log('0.Socket Connected');
    sendMessage({
        id: 'init',
        value: 'groupCall'
    })
}

let webRtcPeer = null;
let sdpOffer = null;
let $step1;
let $nameInp;
let $nameOk;
let $step2;
let $step3;
let $createRoom;
let $rooms;
let $chat;
let $myVideo;
let $streams;
let $roomName;
let $profile;
let $myName;
let streams = [];
let roomId;
$(function () {
    $profile = $("#profile");
    $myName = $("#myName");
    $step1 = $("#step1");
    $step3 = $("#step3");
    $nameInp = $("#nameInp");
    $nameOk = $("#nameOk");
    $roomName = $("#roomName");
    $step2 = $("#step2");
    $createRoom = $("#createRoom").prop('disabled', true);
    $rooms = $("#rooms");
    $chat = $("#chat");
    $myVideo = $('#myVideo');
    $streams = $("#streams");

    $nameOk.on('click',function () {
        const name = $nameInp.val().trim();
        if (!name) {
            alert("이름을 입력하세요");
            $nameInp.trigger('focus');
            return;
        }
        console.log('1. Register');
        sendMessage({
            id: 'register',
            name
        });
        $myName.text(name);
        $createRoom.prop('disabled', false);
        $profile.show();
        $step1.hide();
        $step2.show();
    });

    $createRoom.on('click', function () {
        console.log('3. CreateRoom ' + sdpOffer);
        sendMessage({
            id : 'createRoom'
        });
        $step2.hide();
        $step3.show();
    });

    $rooms.on('click', 'li>button', function () {
        roomId = $(this).data('room-id');
        const roomName = $(this).data('room-name');
        $roomName.text(roomName);
        roomEnter();
        $step2.hide();
        $step3.show();
    })
})

window.onbeforeunload = function() {
    ws.close();
}

ws.onmessage = function(message) {
    const parsedMessage = JSON.parse(message.data);
    // console.info('Received message: ' + message.data);
    switch (parsedMessage.id) {
        case 'newRooms':
            console.log('newRooms');
            newRooms(parsedMessage.rooms);
            break;
        case 'registerResponse':
            console.log('2. Register Response');
            newRooms(parsedMessage.rooms);
            break;
        case 'createRoomResponse':
            createRoomResponse(parsedMessage);
            break;
        case 'roomEnterResponse':
            roomEnterResponse(parsedMessage);
            break;
        case 'join':
            join(parsedMessage);
            break;
        case 'connectResponse':
            connectResponse(parsedMessage);
            break;
        case 'iceCandidate':
            if (parsedMessage.key) {
                const stream = streams.find(item => item.user.id == parsedMessage.key);
                if (stream) {
                    // console.log('iceCandidate ' + parsedMessage.key + ' ' + JSON.stringify(parsedMessage.candidate));
                    stream.peer.addIceCandidate(parsedMessage.candidate);
                }
            } else {
                // console.log('iceCandidate [NULL]' + JSON.stringify(parsedMessage.candidate));
                webRtcPeer.addIceCandidate(parsedMessage.candidate);
            }
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function createRoomResponse(data) {
    roomId = data.roomId;
    $roomName.text(data.roomName);
    roomEnter();
}

function roomEnter() {
    console.log('3. roomEnter ' + roomId);

    const options = {
        localVideo : $myVideo[0],
        onicecandidate: onIceCandidate
    }
    webRtcPeer = WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
        if (error) {
            return console.error(error);
        }

        this.generateOffer(function(error, sdpOffer) {
            if (error) {
                return console.error(error);
            }
            sendMessage({
                id : 'roomEnter',
                sdpOffer,
                roomId
            });
        });
    });
    $myVideo[0].addEventListener("loadeddata", () => $myVideo[0].play());
}

function newRooms(rooms) {
    $rooms.html("");
    for (const room of rooms) {
        $rooms.append(
            $("<li/>").append([
                $("<span/>").html(room.name),
                $("<button/>").addClass('btn btn-white btn-sm').text('JOIN').data('room-id', room.id).data('room-name', room.name)
            ])
        );
    }
}

function roomEnterResponse(data) {
    $rooms.hide();
    if (data.sdpAnswer) {
        console.log('4.3. roomEnterResponse ' + data.sdpAnswer);
        webRtcPeer.processAnswer(data.sdpAnswer);
    }

    for (const item of data.users) {
        addStream(item.user);
    }
}

function connectResponse(data) {
    const stream = streams.find(item => item.user.id == data.userId);
    console.log('connectResponse ' + data.userId);
    if (stream) {
        console.log('connectResponseSdpAnswer ' + data.sdpAnswer);
        stream.peer.processAnswer(data.sdpAnswer);
    }
}

function join(data) {
    addStream(data.user);
}

function addStream(user) {
    console.log('addStream ' + user.id);
    const videoEle = document.createElement('video');
    const options = {
        remoteVideo: videoEle,
        onicecandidate : (candidate) => {
            onIceCandidate(candidate, user.id);
        }
    }
    const peer = WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
        if (error) {
            console.error(error);
        }
        this.generateOffer((error, sdpOffer) => {
            if (error) {
                console.error(error);
            }
            streams.push({
                peer,
                user,
                videoEle
            });

            console.log('connect ' + user.id + '  ' + sdpOffer);
            sendMessage({
                id : 'connect',
                userId: user.id,
                roomId,
                sdpOffer
            });
        });
    });
    $streams.append(
        $("<li/>").append([
            $("<span/>").text(user.name),
            $("<div/>").addClass('video-wrapper').append($("<div/>").append(videoEle))
        ])
    );
    videoEle.addEventListener("loadeddata", () => videoEle.play());

}

function onIceCandidate(candidate, key) {
    console.log('Local candidate' + JSON.stringify(candidate));
    sendMessage({
        id : 'onIceCandidate',
        roomId,
        key,
        candidate : candidate
    });
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    console.log('Sending message: ' + jsonMessage);
    ws.send(jsonMessage);
}