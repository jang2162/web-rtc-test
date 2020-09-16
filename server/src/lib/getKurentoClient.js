import * as kurento from 'kurento-client';
let kurentoClient = null;

export function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento("ws://localhost:8888/kurento", function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + "ws://localhost:8888/kurento";
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}