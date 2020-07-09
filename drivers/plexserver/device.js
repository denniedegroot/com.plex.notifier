'use strict';

const Homey = require('homey');
const Device = require('../../lib/Device.js');
const PlexAPI = require('plex-api');
const WebSocketClient = require('websocket').client;
const EventEmitter = require('events');

const {
  PLEX_TV_API, PLEX_TV_API_PORT, PLEX_IDENTIFIER, PLEX_PRODUCT, PLEX_DEVICENAME, PLEX_PLATFORM, PLEX_VERSION
} = require('../../constants');

const reconnectInterval = 5000;

class DevicePlexServer extends Device {

    async _initDevice() {
        this.log('_initDevice');

        this.plexPlayerStates = [];
        this.plexPlayerSessions = [];
        this.stateEmitter = new EventEmitter();

        this.setUnavailable();

        await this._plexLogin();
        await this._plexWebSocket();

        this.homey.flow.getConditionCard('plex_is_playing')
            .registerRunListener(this._onFlowConditionPlaying.bind(this));

        this.homey.flow.getConditionCard('plex_is_paused')
            .registerRunListener(this._onFlowConditionPaused.bind(this));

        this.stateEmitter.on('PlexEvent', (event) => {
            if (event.state === 'stopped') {
                this._closedSessionHandler(event);
            } else if (event.state === 'playing' || event.state === 'paused') {
                this._openSessionHandler(event);
            } else {
                if (this.plexPlayerSessions[event.key])
                    this.error('_plexEvent unhandled state detected : ', event.state);
            }
        });
    }

    _uninitDevice() {
        this.log('_uninitDevice');

        if (this.wsclient)
            this.wsclient.close();
    }

    async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr) {
        this.log('onSettings');
    }

    async _onFlowConditionPlaying(args, state) {
        this.log('_onFlowConditionPlaying');
        let playing = false;

        if (args.player in this.plexPlayerStates)
            playing = this.plexPlayerStates[args.player] === 'playing';

        return playing;
    }

    async _onFlowConditionPaused(args, state) {
        this.log('_onFlowConditionPaused');
        let paused = false;

        if (args.player in this.plexPlayerStates)
            paused = this.plexPlayerStates[args.player] === 'paused';

        return paused;
    }

    async _plexLogin() {
        this.log('_plexLogin');

        this.plexClient = new PlexAPI({
            'hostname': this.getSettings().host,
            'port': this.getSettings().port,
            'https': true,
            'token': this.getData().accessToken,
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

        this.plexClient.query('/').then((result) => {
            this.setSettings({ version: result.MediaContainer.version });
        }).catch((error) => {
            this.setUnavailable();
            this.error(error);
        });
    }

    async _plexWebSocket() {
        this.wsclient = new WebSocketClient({tlsOptions: {rejectUnauthorized: false}});

        this.wsclient.on('connectFailed', (error) => {
            this.setUnavailable();
            this.error('_plexWebSocket error ' + error.toString());
            setTimeout(this._plexWebSocket.bind(this), reconnectInterval);
        });

        this.wsclient.on('connect', (connection) => {
            this.setAvailable();
            this.log('_plexWebSocket connected');

            connection.on('error', (error) => {
                this.setUnavailable();
                this.error('_plexWebSocket error: ' + error.toString());
                setTimeout(this._plexWebSocket.bind(this), reconnectInterval);
            });

            connection.on('close', () => {
                this.setUnavailable();
                this.log('_plexWebSocket closed');
                setTimeout(this._plexWebSocket.bind(this), reconnectInterval);
            });

            connection.on('message', (message) => {
                if (message.type === 'utf8') {
                    try {
                        let parsed = JSON.parse(message.utf8Data);
                        let data = parsed.NotificationContainer;
                        let type = data.type;

                        if (type === 'playing') {
                            this.stateEmitter.emit('PlexEvent', {
                                'state': data.PlaySessionStateNotification[0].state,
                                'key': data.PlaySessionStateNotification[0].sessionKey
                            });
                        }
                    } catch (e) {
                        this.error(e);
                    }
                }
            });
        });

        let ws_proto = this.plexClient.https ? 'wss' : 'ws';
        this.wsclient.connect(ws_proto + '://' + this.plexClient.hostname + ':' + this.plexClient.port + '/:/websockets/notifications?X-Plex-Token=' + this.plexClient.authToken);
    }

    async _triggerFlow(event, tokens) {
        this.log('_triggerFlow', event);
        this.homey.flow.getDeviceTriggerCard('plex_' + event).trigger(this, tokens, {}).catch(this.error);
    }

    async _openSessionHandler(event) {
        this.log('_openSessionHandler', event.state);

        this.plexClient.query('/status/sessions/').then((result) => {
            let container;

            if (result.MediaContainer.Video) {
                container = result.MediaContainer.Video;
            } else if (result.MediaContainer.Metadata) {
                container = result.MediaContainer.Metadata;
            } else {
                this.error('_openSessionHandler no valid container found');
                return;
            }

            let session = container.filter(item => item.sessionKey === event.key);

            if (!session) {
                this.error('_openSessionHandler no valid session found');
                return;
            }

            this.plexPlayerSessions[event.key] = {
                'player': session[0].Player.title,
                'title': session[0].title,
                'type': session[0].type,
                'user': session[0].User.title,
                'address': session[0].Player.address
            }

            if (this.plexPlayerStates[session[0].Player.title] != event.state) {
                this.log('_openSessionHandler state change');
                this.plexPlayerStates[session[0].Player.title] = event.state;
                this.plexPlayerStates[session[0].Player.address] = event.state;

                this._triggerFlow(event.state, this.plexPlayerSessions[event.key])
            } else {
                this.log('_openSessionHandler no state change');
                this.plexPlayerStates[session[0].Player.title] = event.state;
                this.plexPlayerStates[session[0].Player.address] = event.state;
            }
        }).catch((error) => {
            this.error('_openSessionHandler ', error);
        });
    }

    async _closedSessionHandler(event) {
        this.log('_closedSessionHandler', event.state);

        if (this.plexPlayerSessions[event.key]) {
            this._triggerFlow(event.state, this.plexPlayerSessions[event.key]);

            delete this.plexPlayerStates[this.plexPlayerSessions[event.key].player];
            delete this.plexPlayerStates[this.plexPlayerSessions[event.key].address];
            delete this.plexPlayerSessions[event.key];
        } else {
            this.log('_closedSessionHandler no valid session found');
        }
    }

}

module.exports = DevicePlexServer;
