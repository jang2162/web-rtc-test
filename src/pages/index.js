import $ from 'jquery';

$(async function (){
    const $a = $("#a")
    const $b = $("#b")
    const $list = $("#list")
    const $video = $("#video")
    const videoEle = $video.get(0);
    let stream = null;
    let peer;
    let conn;
    let callObj = {};
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
                width: 480,
                height: 270,
                mediaSource: "tab"
            }
        });
        /* 스트림 사용 */

        videoEle.srcObject = stream;
        videoEle.onloadedmetadata = function(e) {
            videoEle.play();
        };
    } catch(err) {
        /* 오류 처리 */
    }

    $("#btn").on('click', function () {
        peerInit();
    });

    $("#btn2").on('click', function () {
        callPeer($b.val());
    });

    function addVideo(newStream) {
        console.log(3);

        const videoEle = document.createElement('video');
        videoEle.srcObject = newStream;
        videoEle.onloadedmetadata = function(e) {
            videoEle.play();
        };
        $list.append(videoEle);
    }

    function callPeer(id) {
        if (callObj[id]) {
            return;
        }
        callObj[id] = peer.call($b.val(), stream);
        callObj[id].on('stream', function(stream2) {
            addVideo(stream2);
            callObj[id].off('stream');
        });
    }

    function peerInit() {
        if (conn) {
            conn.close();
        }
        if (peer) {
            peer.destroy();
        }

        peer = new Peer($a.val(), {
            host: '192.168.0.169',
            port: 3000,
            path: '/webrtc',
            debug: 3
        });
        conn = peer.connect($b.val());
        conn.on('open', () => {
            console.log(234234);
            conn.send('hi!');
        });

        peer.on('call', function(call) {
            // Answer the call, providing our mediaStream
            console.log(call);
            call.answer(stream);
            call.on('stream', function(newStream) {
                console.log(1);
                addVideo(newStream);
                call.off('stream');
            });
        });

    }
});

