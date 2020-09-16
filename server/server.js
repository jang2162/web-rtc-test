import express from 'express';
import * as url from 'url';

import {readFileSync} from 'fs';
import {createServer} from 'https';
import {one2oneWs} from './src/lib/pages/one2one/one2one';
import {groupCallWs} from './src/lib/pages/groupCall/groupCallWs';

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
var server = createServer(options, app).listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
    one2oneWs(server);
    groupCallWs(server);
});

