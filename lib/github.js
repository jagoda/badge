"use strict";
var fs     = require("fs");
var Hapi   = require("hapi");
var Logger = require("./Logger");
var Nipple = require("nipple");
var path   = require("path");
var Q      = require("q");
var url    = require("url");
var _      = require("lodash");

var GITHUB_API   = "https://api.github.com";
var GITHUB_TOKEN = url.resolve(GITHUB_API, "/authorizations/clients/");
var GITHUB_USER  = url.resolve(GITHUB_API, "/user");

function version () {
	var meta = JSON.parse(
		fs.readFileSync(path.join(__dirname, "..", "package.json"))
	);

	return meta.version;
}

exports.register = function (plugin, options, done) {
	var log = new Logger(plugin, [ "github" ]);

	function getToken (config, options, result) {
		var tokenUrl = GITHUB_TOKEN + config.clientId;

		options = _.clone(options);
		/* jshint -W106 */
		options.payload = JSON.stringify({
			client_secret : config.clientSecret,
			note          : config.note,
			note_url      : config.url,
			scopes        : config.scopes
		});
		/* jshint +W106 */

		return Q.ninvoke(Nipple, "put", tokenUrl, options)
		.spread(function (response, payload) {

			if (_.indexOf([ 200, 201 ], response.statusCode) >= 0) {
				log.info(
					"successfully retrieved token for '%s'",
					result.credentials.username
				);
				result.artifacts = {
					token : JSON.parse(payload).token
				};
			}
			else {
				log.warn(
					"failed to get token for '%s'",
					result.credentials.username
				);
				throw Hapi.error.unauthorized("token request failed");
			}

			return result;
		});
	}

	function login (options, result) {
		return Q.ninvoke(Nipple, "get", GITHUB_USER, options)
		.spread(function (response, payload) {

			if (response.statusCode === 200) {
				log.info(
					"successfully authenticated '%s'",
					result.credentials.username
				);
				result.credentials.username = JSON.parse(payload).login;
			}
			else {
				log.warn(
					"failed to authenticate '%s'",
					result.credentials.username
				);
				throw Hapi.error.unauthorized("login failed");
			}

			return result;
		});
	}

	function parseCredentials (request) {
		var credentials = Object.create(null);
		var parts       = request.headers.authorization ? request.headers.authorization.split(" ") : [ "" ];
		var token;

		switch(parts[0].toLowerCase()) {
			case "basic": {
				log.info("detected basic credential");
				token = (new Buffer(parts[1], "base64")).toString();
				token = token.split(":");

				credentials.username = token[0];
				credentials.password = token[1];
				break;
			}
			case "token": {
				log.info("detected token credential");
				credentials.token = parts[1];
				break;
			}
			default: {
				log.warn("unknown credential type");
			}
		}

		return credentials;
	}

	plugin.auth.scheme("github-basic", function (server, config) {
		var requiredKeys = [
			"clientId", "clientSecret", "note", "scopes", "url"
		];

		if (config) {
			_.each(requiredKeys, function (key) {
				if (! config[key]) {
					throw new Error("The github-basic config requires a '" + key + "'.");
				}
			});
		}

		return {
			authenticate : function (request, reply) {
				var options     = {
					headers : {
						authorization : request.headers.authorization
					}
				};
				var result = {
					artifacts   : {},
					credentials : _.pick(parseCredentials(request), "username")
				};

				if (!result.credentials.username) {
					log.warn("no credentials supplied with the request");
					reply(Hapi.error.unauthorized("forbidden"), result);
					return;
				}

				log.info(
					"attempting to authenticate '%s'",
					result.credentials.username
				);

				login(options, result)
				.then(function (result) {
					if (config) {
						return getToken(config, options, result);
					}

					return result;
				})
				.then(
					function (result) {
						reply(null, result);
					},
					function (error) {
						if (!error.isBoom) {
							log.error(
								"unexpected error: %s\n%s",
								error.message,
								error.stack
							);
							error = Hapi.error.internal("failed to authenticate", error);
						}

						reply(error, result);
					}
				)
				.done();
			}
		};
	});

	plugin.auth.scheme("github-token", function (server, config) {
		var authorization = "Basic " +
			(new Buffer(config.clientId + ":" + config.clientSecret)).toString("base64");

		return {
			authenticate : function (request, reply) {
				var credentials = parseCredentials(request);
				var options     = {
					headers : {
						authorization : authorization
					}
				};
				var result = {
					credentials : {}
				};

				var tokenUrl = url.resolve(
					GITHUB_API,
					"/applications/" + config.clientId + "/tokens/" + credentials.token
				);

				Q.ninvoke(Nipple, "get", tokenUrl, options)
				.spread(function (response, payload) {

					if (response.statusCode === 200) {
						result.credentials.username = JSON.parse(payload).user.login;
						log.info(
							"successfully authenticated '%s'",
							result.credentials.username
						);
					}

					return result;
				})
				.then(
					function (result) {
						reply(null, result);
					}
				)
				.done();
			}
		};
	});

	done();
};

exports.register.attributes = {
	name    : "badge",
	version : version()
};
