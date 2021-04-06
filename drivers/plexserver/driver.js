'use strict';

const Homey = require('homey');
const Driver = require('../../lib/Driver.js');
const PlexAPI = require('plex-api');

const {
  PLEX_TV_API, PLEX_TV_API_PORT, PLEX_IDENTIFIER, PLEX_PRODUCT, PLEX_DEVICENAME, PLEX_PLATFORM, PLEX_VERSION
} = require('../../constants');

class PlexServer extends Driver {

    onInit() {
        this.log('onInit');
    }

    async onPairListDevices(token) {
        this.log('onPairListDevices');

        let servers = null;
        let foundDevices = [];

        this.plexClient = new PlexAPI({
            'hostname': PLEX_TV_API,
            'port': PLEX_TV_API_PORT,
            'https': true,
            'token': token,
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

        await this.plexClient.query('/api/resources').then((result) => {
            servers = result.MediaContainer.Device;
        });

        if (servers === undefined)
            return [];

        await Promise.all(servers.map(async (server) => {
            let host_connection = '';
            let host_port = '';

            if (server.attributes.product !== 'Plex Media Server' || !server.attributes.owned)
                return false;

            await Promise.all(server.Connection.map(async (connection) => {
                if (host_connection === '' || connection.attributes.local === '1') {
                    host_connection = connection.attributes.address;
                    host_port = connection.attributes.port;
                }
            }));

            foundDevices.push({
                name : server.attributes.name,
                data : {
                    id : server.attributes.clientIdentifier,
                    accessToken : server.attributes.accessToken
                },
                settings : {
                    host : host_connection,
                    port : host_port,
                    version : server.attributes.productVersion
                }
            });
        }));

        return foundDevices;
    }
}

module.exports = PlexServer;
