
export class UserRegistry {
    // usersById;
    // usersByName;
    constructor() {
        this.usersById = {};
        this.usersByName = {};
    }

    register(user) {
        this.usersById[user.id] = user;
        this.usersByName[user.name] = user;
    }

    unregister(id) {
        const user = this.getById(id);
        if (user) delete this.usersById[id]
        if (user && this.getByName(user.name)) delete this.usersByName[user.name];
    }

    getByName(name) {
        return this.usersByName[name];
    }

    getById(id) {
        return this.usersById[id];
    }

    removeById(id) {
        const userSession = this.usersById[id];
        if (!userSession) return;
        delete this.usersById[id];
        delete this.usersByName[userSession.name];
    }
}
