import "@babel/polyfill";
import express from 'express';
import * as url from 'url';

import {readFileSync} from 'fs';
import {createServer} from 'https';
import {one2oneWs} from './src/lib/pages/one2one/one2one';
import {groupCallWs} from './src/lib/pages/groupCall/groupCallWs';
import * as ws from 'ws'

var options =
    {
        key: readFileSync('./cert/private.dev.pem'),
        cert: readFileSync('./cert/public.dev.pem')
    };

var app = express();
app.use(express.static('public'));

/*
 * Server startup
 */
var asUrl = url.parse("https://drawerjang.com:8443/");
var port = asUrl.port;
var server = createServer(options, app).listen(port, function (event, listener) {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
    one2oneWs(server);
    groupCallWs(server);

    const wss = new ws.Server({
        server
    });
    wss.on('connection', ws => {
        const listener = function(_message) {
            const message = JSON.parse(_message);
            if (message.id === 'init') {
                ws.off('message', listener);
                if (message.value === 'one2one') {
                    one2oneWs(ws);
                } else if (message.value === 'groupCall') {
                    groupCallWs(ws);
                }
            }
        };
        ws.addListener('message', listener);

    })
});

