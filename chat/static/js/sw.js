var SW_VERSION = '1.5';
console.log("%cSW_S startup, version is " + SW_VERSION, 'color: #ffb500; font-weight: bold');


var loggerFactory = (function (logsEnabled) {
	var self = this;
	self.logsEnabled = logsEnabled;
	self.dummy = function() {};
	self.emptyFunction = function() {};
	self.getLogger = function (initiator, style) {
		return {
			warn: self.getSingleLogger(initiator, style, console.warn),
			log: self.getSingleLogger(initiator, style, console.log),
			error: self.getSingleLogger(initiator, style, console.error),
			debug: self.getSingleLogger(initiator, style, console.debug)
		}
	};
	self.getSingleLogger = function (initiator, style, fn) {
		return function () {
			if (!self.logsEnabled) {
				return self.dummy;
			}
			var args = Array.prototype.slice.call(arguments);
			var parts = args.shift().split('{}');
			var params = [console, '%c' + initiator, style];
			for (var i = 0; i < parts.length; i++) {
				params.push(parts[i]);
				if (typeof args[i] !== 'undefined') { // args can be '0'
					params.push(args[i])
				}
			}
			return Function.prototype.bind.apply(fn, params);
		};
	};
	return self;
})(true);

var logger = loggerFactory.getLogger("SW_S", 'color: #ffb500; font-weight: bold');
var subScr = null;

// Install Service Worker
self.addEventListener('install', function (event) {
	logger.log(' installed!')();
});

// Service Worker Active
self.addEventListener('activate', function (event) {
	logger.log(' activated!')();
});


function getSubscriptionId(pushSubscription) {
	var mergedEndpoint = pushSubscription.endpoint;
	if (pushSubscription.endpoint.indexOf('https://android.googleapis.com/gcm/send') === 0) {
		if (pushSubscription.subscriptionId &&
				pushSubscription.endpoint.indexOf(pushSubscription.subscriptionId) === -1) {
			mergedEndpoint = pushSubscription.endpoint + '/' +
					pushSubscription.subscriptionId;
		}
	}
	var GCM_ENDPOINT = 'https://android.googleapis.com/gcm/send';
	if (mergedEndpoint.indexOf(GCM_ENDPOINT) !== 0) {
		return null;
	} else {
		return mergedEndpoint.split('/').pop();
	}
}

function getAuth(cb) {
	if (subScr) {
		cb(subScr);
	} else {
		self.registration.pushManager.getSubscription().then(function (r) {
			subScr = getSubscriptionId(r);
			cb(subScr)
		});
	}
}

self.addEventListener('push', function (event) {
	logger.log('Received a push message {}', event)();

	getAuth(function (auth) {
		if (auth) {
			fetch('/get_firebase_playback', {
				credentials: 'omit',
				headers: {auth: auth}
			}).then(function (response) {
				logger.log("Fetching finished {}", response)();
				return response.json();
			}).then(function (m) {
				logger.log("Parsed response {}", m)();
				self.registration.getNotifications().then(function (notifications) {
					var count = 1;
					if (m.options && m.options.data) {
						var room = m.options.data.room;
						var sender = m.options.data.sender;
						for (var i = 0; i < notifications.length; i++) {
							if (room && notifications[i].data.room === room
									|| (sender && notifications[i].data.sender === sender)) {
								notifications[i].close();
								count+= notifications[i].data.replaced || 1;
							}
						}
						if (count > 1) {
							m.options.data.replaced = count;
							if (room) {
								m.title = "Room: " + room + "(+" + count + ")";
								m.options.body = sender + ':' + m.options.body;
							} else if (sender) {
								m.title = sender + "(+" + count + ")";
							}
						}
					}
					self.registration.showNotification(m.title, m.options);
					logger.log("Spawned notification {}", m)();
				});

			}).catch(function (response) {
				if (response.message  === 'Failed to fetch') {
					logger.error('Got "Failed to fetch" exception while getting message, this could be caused by invalid/self signed certificate, if this during development try to run chrome with  --allow-insecure-localhost --user-data-dir=/tmp/lol')();
				} else {
						logger.error('Exception during fetching message: {}', response)();
				}
			})
		} else {
			logger.error("Auth header is null")();
		}

	})
});

self.addEventListener('notificationclick', function (event) {
	logger.log('On notification click: {}', event.notification.tag)();
	// Android doesn’t close the notification when you click on it
	// See: http://crbug.com/463146
	event.notification.close();

	// This looks to see if the current is already open and
	// focuses if it is
	event.waitUntil(clients.matchAll({
		type: 'window'
	}).then(function (clientList) {
		var roomId = event.notification.data && event.notification.data.roomId;
		if (clientList && clientList[0] && roomId) {
			clientList[0].navigate('/#/chat/' + roomId)
		} else if (clientList && clientList[0]) {
			clientList[0].focus()
		} else if (roomId) {
			clients.openWindow('/#/chat/' + roomId);
		} else {
			clients.openWindow('/');
		}
	}));
});

