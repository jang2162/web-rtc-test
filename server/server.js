import express from 'express';
import {readFileSync} from 'fs';
import {createServer} from 'https';
import { ExpressPeerServer } from 'peer';

const ssl = {
    key: readFileSync('./cert/private.dev.pem'),
    cert: readFileSync('./cert/public.dev.pem')
}

const app = express();
const port = 3000
app.use(express.static('public'));


const server = createServer({...ssl}, app).listen(port, () => {
    console.log(`Example app listening at https://localhost:${port}`)
});


const peerServer = ExpressPeerServer(server, {
    path: '/webrtc',
    debug: true
});

app.use(peerServer);

