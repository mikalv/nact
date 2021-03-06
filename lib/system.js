const { Actor, spawnFixedFunction } = require('./actor');
const { ActorSystemReference } = require('./references');
const { LocalPath } = require('./paths');
const freeze = require('deep-freeze-node');
const assert = require('assert');

class ActorSystem {
    constructor() {
        this.children = new Map();
        this.reference = new ActorSystemReference(this);
        this.childReferences = new Map();
        this.path = LocalPath.root();
        this.stopped = false;
        this.index = 0;
    }

    tryFindActorFromPath(path) {
        let actor = this;
        if (path instanceof LocalPath) {
            let result = path.localParts.reduce((child, part) => child && child.children.get(part), this);
            return (result || {}).reference;
        }
        throw new TypeError('Only LocalPath is supported in this version of nact');
    }

    childStopped(child) {
        this.children.delete(child.name);
        this.childReferences.delete(child.name);
    }

    childSpawned(child) {
        this.childReferences.set(child.name, child.reference);
        this.children.set(child.name, child);
    }

    stop() {
        [...this.children.values()].map(child => child.stop());
        this.stopped = true;
    }

    terminate() {
        [...this.children.values()].map(child => child.terminate());
        this.stopped = true;
    }
    
    assertNotStopped() { assert(!this.stopped); }

    spawn(f, name) {
        this.assertNotStopped();
        let actor = new Actor(this, name, this, f);
        return actor.reference;
    }

    spawnFixed(f, name) {
        this.assertNotStopped();
        return this.spawn(spawnFixedFunction(f), name);
    }
}


const start = () => new ActorSystem().reference;

module.exports = { start };


