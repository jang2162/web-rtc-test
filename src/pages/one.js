import $ from 'jquery';
import {WebRtcPeer} from 'kurento-utils'

let ws = new WebSocket('wss://' + location.host + '/one2one');
let videoInput;
let videoOutput;
let webRtcPeer;

const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;
let registerState = null

function setRegisterState(nextState) {
    const $register = $('#register');
    const $call = $('#call');
    const $terminate = $('#terminate');
    switch (nextState) {
        case NOT_REGISTERED:
            $register.prop('disabled', false);
            $call.prop('disabled', true);
            $terminate.prop('disabled', true);
            break;

        case REGISTERING:
            $register.prop('disabled', true);
            break;

        case REGISTERED:
            $register.prop('disabled', true);
            setCallState(NO_CALL);
            break;

        default:
            return;
    }
    registerState = nextState;
}

const NO_CALL = 0;
const PROCESSING_CALL = 1;
const IN_CALL = 2;
let callState = null

function setCallState(nextState) {
    const $call = $('#call');
    const $terminate = $('#terminate');
    switch (nextState) {
        case NO_CALL:
            $call.prop('disabled', false);
            $terminate.prop('disabled', true);
            break;

        case PROCESSING_CALL:
            $call.prop('disabled', true);
            $terminate.prop('disabled', true);
            break;
        case IN_CALL:
            $call.prop('disabled', true);
            $terminate.prop('disabled', false);
            break;
        default:
            return;
    }
    callState = nextState;
}

window.onload = function() {
    setRegisterState(NOT_REGISTERED);
    videoInput = document.getElementById('videoInput');
    videoOutput = document.getElementById('videoOutput');
    document.getElementById('name').focus();

    document.getElementById('register').addEventListener('click', function() {
        register();
    });
    document.getElementById('call').addEventListener('click', function() {
        call();
    });
    document.getElementById('terminate').addEventListener('click', function() {
        stop();
    });
}

window.onbeforeunload = function() {
    ws.close();
}

ws.onmessage = function(message) {
    const parsedMessage = JSON.parse(message.data);
    console.info('Received message: ' + message.data);

    switch (parsedMessage.id) {
        case 'registerResponse':
            resgisterResponse(parsedMessage);
            break;
        case 'callResponse':
            callResponse(parsedMessage);
            break;
        case 'incomingCall':
            incomingCall(parsedMessage);
            break;
        case 'startCommunication':
            startCommunication(parsedMessage);
            break;
        case 'stopCommunication':
            console.info("Communication ended by remote peer");
            stop(true);
            break;
        case 'iceCandidate':
            webRtcPeer.addIceCandidate(parsedMessage.candidate)
            break;
        default:
            console.error('Unrecognized message', parsedMessage);
    }
}

function resgisterResponse(message) {
    if (message.response === 'accepted') {
        setRegisterState(REGISTERED);
    } else {
        setRegisterState(NOT_REGISTERED);
        const errorMessage = message.message ? message.message
            : 'Unknown reason for register rejection.';
        console.log(errorMessage);
        alert('Error registering user. See console for further information.');
    }
}

function callResponse(message) {
    if (message.response !== 'accepted') {
        console.info('Call not accepted by peer. Closing call');
        const errorMessage = message.message ? message.message
            : 'Unknown reason for call rejection.';
        console.log(errorMessage);
        stop(true);
    } else {
        setCallState(IN_CALL);
        webRtcPeer.processAnswer(message.sdpAnswer);
    }
}

function startCommunication(message) {
    setCallState(IN_CALL);
    webRtcPeer.processAnswer(message.sdpAnswer);
}

function incomingCall(message) {
    // If bussy just reject without disturbing user
    if (callState !== NO_CALL) {
        const response = {
            id : 'incomingCallResponse',
            from : message.from,
            callResponse : 'reject',
            message : 'bussy'

        };
        return sendMessage(response);
    }

    setCallState(PROCESSING_CALL);
    if (confirm('User ' + message.from
        + ' is calling you. Do you accept the call?')) {
        showSpinner(videoInput, videoOutput);

        const options = {
            localVideo : videoInput,
            remoteVideo : videoOutput,
            onicecandidate : onIceCandidate
        }

        webRtcPeer = WebRtcPeer.WebRtcPeerSendrecv(options,
            function(error) {
                if (error) {
                    console.error(error);
                    setCallState(NO_CALL);
                }

                this.generateOffer(function(error, offerSdp) {
                    if (error) {
                        console.error(error);
                        setCallState(NO_CALL);
                    }
                    const response = {
                        id : 'incomingCallResponse',
                        from : message.from,
                        callResponse : 'accept',
                        sdpOffer : offerSdp
                    };
                    sendMessage(response);
                });
            });

    } else {
        const response = {
            id : 'incomingCallResponse',
            from : message.from,
            callResponse : 'reject',
            message : 'user declined'
        };
        sendMessage(response);
        stop(true);
    }
}

function register() {
    const name = document.getElementById('name').value;
    if (name === '') {
        window.alert("You must insert your user name");
        return;
    }

    setRegisterState(REGISTERING);

    const message = {
        id : 'register',
        name : name
    };
    sendMessage(message);
    document.getElementById('peer').focus();
}

function call() {
    if (document.getElementById('peer').value === '') {
        window.alert("You must specify the peer name");
        return;
    }

    setCallState(PROCESSING_CALL);

    showSpinner(videoInput, videoOutput);

    const options = {
        localVideo : videoInput,
        remoteVideo : videoOutput,
        onicecandidate : onIceCandidate
    }

    webRtcPeer = WebRtcPeer.WebRtcPeerSendrecv(options, function(
        error) {
        if (error) {
            console.error(error);
            setCallState(NO_CALL);
        }

        this.generateOffer(function(error, offerSdp) {
            if (error) {
                console.error(error);
                setCallState(NO_CALL);
            }
            const message = {
                id : 'call',
                from : document.getElementById('name').value,
                to : document.getElementById('peer').value,
                sdpOffer : offerSdp
            };
            sendMessage(message);
        });
    });

}

function stop(message) {
    setCallState(NO_CALL);
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;

        if (!message) {
            message = {
                id : 'stop'
            }
            sendMessage(message);
        }
    }
    hideSpinner(videoInput, videoOutput);
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    console.log('Sending message: ' + jsonMessage);
    ws.send(jsonMessage);
}

function onIceCandidate(candidate) {
    console.log('Local candidate' + JSON.stringify(candidate));

    const message = {
        id : 'onIceCandidate',
        candidate : candidate
    }
    sendMessage(message);
}

function showSpinner() {
    for (let i = 0; i < arguments.length; i++) {
        arguments[i].poster = './img/transparent-1px.png';
        arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
}

function hideSpinner() {
    for (let i = 0; i < arguments.length; i++) {
        arguments[i].src = '';
        arguments[i].poster = './img/webrtc.png';
        arguments[i].style.background = '';
    }
}
