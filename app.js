'use strict';

const Homey = require('homey');

module.exports = class PlexApp extends Homey.App {

    log() {
        console.log.bind(this, '[log]').apply(this, arguments);
    }

    error() {
        console.error.bind(this, '[error]').apply(this, arguments);
    }

    onInit() {
        this.log(`${Homey.manifest.id} running...`);
    }

}
