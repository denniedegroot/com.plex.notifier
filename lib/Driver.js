'use strict';

const Homey = require('homey');
const PlexAPI = require('plex-api');

const {
  PLEX_TV_API, PLEX_TV_API_PORT, PLEX_IDENTIFIER, PLEX_PRODUCT, PLEX_DEVICENAME, PLEX_PLATFORM, PLEX_VERSION
} = require('../constants');

const PLEX_TOKEN_TIMEOUT_SECONDS = 30;

class Driver extends Homey.Driver {

    async onPair (session) {
        this.log('onPair');

        this.pin = null;
        this.token = null;
        this.plexClient = new PlexAPI({
            'hostname': PLEX_TV_API,
            'port': PLEX_TV_API_PORT,
            'https': true,
            'token': '',
            'options': {
                'identifier': PLEX_IDENTIFIER,
                'product': PLEX_PRODUCT,
                'deviceName': PLEX_DEVICENAME,
                'platform': PLEX_PLATFORM,
                'version': PLEX_VERSION

            },
            'requestOptions': {
                'rejectUnauthorized': false
            }
        });

        session.setHandler('showView', async (viewId) => {
            let retry = 0;

            if (viewId === 'server_credentials') {
                this.pin = await this.getPin(this.plexClient);
                session.emit('pin', this.pin.code);

                if (!this.pin.code)
                    return;

                while (this.token === null && retry < PLEX_TOKEN_TIMEOUT_SECONDS) {
                    await new Promise(async (resolve) => {
                        setTimeout(async () =>  {
                            this.token = await this.getToken(this.plexClient, this.pin);
                            resolve();
                        }, 1000)
                    });

                    retry++;
                }

                if (this.token)
                    session.emit('token', '');
                else
                    session.emit('token', 'failed');
            }
        });

        session.setHandler('list_devices', async (data) => {
            let foundDevices = [];

            if (!this.onPairListDevices)
                this.error((new Error('missing onPairListDevices')));

            foundDevices = await this.onPairListDevices(this.token);

            return foundDevices;
        });
    }

    async getPin(plexClient) {
        this.log('getPin');

        let pin = null;

        await plexClient.postQuery('/pins.xml').then(async (result) => {
            pin = result.pin;
        });

        return pin;
    }

    async getToken(plexClient, pin) {
        this.log('getToken');

        let token = null;

        await plexClient.query('/pins/' + pin.id[0]._ + '.xml').then(async (result) => {
            token = result.pin.auth_token[0];

            if (!token || typeof token !== 'string' || token === '') {
                this.error('Token not found');
                token = null;
            }

            if (result.pin.id[0]._ != pin.id[0]._) {
                this.error('Invalid session');
                token = null;
            }
        });

        return token;
    }

}

module.exports = Driver;
