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

        await this.plexClient.query('/pms/servers.xml').then((result) => {
            servers = result.MediaContainer.Server;
        });

        await Promise.all(servers.map(async (server) => {
            let host_connection = '';

            if (!server.attributes.owned)
                return false;

            if (server.attributes.localAddresses)
                host_connection = server.attributes.localAddresses.split(',')[0]
            else
                host_connection = server.attributes.host;

            foundDevices.push({
                name : server.attributes.name,
                data : {
                    id : server.attributes.machineIdentifier,
                    accessToken : server.attributes.accessToken
                },
                settings : {
                    host : host_connection,
                    port : server.attributes.port,
                    localAddresses : server.attributes.localAddresses,
                    externalAddress : server.attributes.host,
                    owned : server.attributes.owned,
                    version : server.attributes.version
                }
            });
        }));

        return foundDevices;
    }
}

module.exports = PlexServer;
