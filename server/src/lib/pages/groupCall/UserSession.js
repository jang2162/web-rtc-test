export class UserSession {
    // id;
    // name;
    // ws;
    // peer;
    // sdpOffer;
    constructor(id, name, ws) {
        this.id = id;
        this.name = name;
        this.ws = ws;
        this.peer = null;
        this.sdpOffer = null;
        this.rooms = [];
    }

    sendMessage(message) {
        this.ws.send(JSON.stringify(message));
    }
}

