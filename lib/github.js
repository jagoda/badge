"use strict";
var fs     = require("fs");
var Hapi   = require("hapi");
var Joi    = require("joi");
var Logger = require("./Logger");
var LRU    = require("lru-cache");
var Nipple = require("nipple");
var path   = require("path");
var Q      = require("q");
var url    = require("url");
var _      = require("lodash");

var BASIC_SCHEME = "Basic";
var TOKEN_SCHEME = "token";

var GITHUB_API   = "https://api.github.com";
var GITHUB_TOKEN = url.resolve(GITHUB_API, "/authorizations/clients/");
var GITHUB_USER  = url.resolve(GITHUB_API, "/user");
var USER_AGENT   = "Nipple";

function version () {
	var meta = JSON.parse(
		fs.readFileSync(path.join(__dirname, "..", "package.json"))
	);

	return meta.version;
}

exports.register = function (plugin, options, done) {
	var log = new Logger(plugin, [ "github" ]);

	function basicAuth (username, password) {
		return BASIC_SCHEME + " " + (new Buffer(username + ":" + password)).toString("base64");
	}

	function basicLogin (config, options, result) {
		return Q.ninvoke(Nipple, "get", GITHUB_USER, githubRequest(options))
		.spread(function (response, payload) {
			payload = payload || "{}";

			if (response.statusCode === 200) {
				log.info(
					"successfully authenticated '%s'",
					result.credentials.username
				);
				result.credentials.username = JSON.parse(payload).login;
			}
			else {
				log.warn(
					"failed to authenticate '%s': %s (%d)",
					result.credentials.username,
					JSON.parse(payload).message,
					response.statusCode
				);
				throw failure("login failed", BASIC_SCHEME, config);
			}

			return result;
		});
	}

	function checkOrganization (options) {
		var request = {
			headers : {
				authorization : options.authorization
			}
		};

		var orgUrl = url.resolve(
			GITHUB_API,
			"/orgs/" + options.organization + "/members/" + options.result.credentials.username
		);

		return Q.ninvoke(Nipple, "get", orgUrl, githubRequest(request))
		.spread(function (response) {

			if (response.statusCode === 204) {
				log.info("'%s' is a member of '%s'", options.result.credentials.username, options.organization);
				options.result.credentials.organization = options.organization;
			}
			else {
				log.warn("'%s' is NOT a member of '%s'", options.result.credentials.username, options.organization);
				throw failure("not authorized", options.scheme, options);
			}

			return options.result;
		});
	}

	function createCache () {
		return new LRU({
			max : 500,
			maxAge : 1000 * 60    // 1 minute
		});
	}

	function failure (message, scheme, options) {
		return Hapi.error.unauthorized(message, scheme, _.pick(options, "realm"));
	}

	function getToken (config, options, result) {
		var tokenUrl = GITHUB_TOKEN + config.application.clientId;

		options = _.clone(options);
		/* jshint -W106 */
		options.payload = JSON.stringify({
			client_secret : config.application.clientSecret,
			note          : config.application.note,
			note_url      : config.application.url,
			scopes        : config.application.scopes
		});
		/* jshint +W106 */

		return Q.ninvoke(Nipple, "put", tokenUrl, githubRequest(options))
		.spread(function (response, payload) {

			if (_.indexOf([ 200, 201 ], response.statusCode) >= 0) {
				log.info(
					"successfully retrieved token for '%s'",
					result.credentials.username
				);
				result.artifacts.token = JSON.parse(payload).token;
			}
			else {
				log.warn(
					"failed to get token for '%s'",
					result.credentials.username
				);
				throw failure("token request failed", TOKEN_SCHEME, config);
			}

			return result;
		});
	}

	function githubRequest (options) {
		options.headers["user-agent"] = USER_AGENT;
		return options;
	}

	function parseCredentials (request) {
		var credentials = Object.create(null);
		var parts       = request.headers.authorization ? request.headers.authorization.split(" ") : [ "" ];
		var token;

		switch(parts[0].toLowerCase()) {
			case BASIC_SCHEME.toLowerCase(): {
				log.info("detected basic credential");
				token = (new Buffer(parts[1], "base64")).toString();
				token = token.split(":");

				credentials.username = token[0];
				credentials.password = token[1];
				break;
			}
			case TOKEN_SCHEME.toLowerCase(): {
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

	function tokenLogin (options) {
		return Q.ninvoke(Nipple, "get", options.url, githubRequest(options.request))
		.spread(function (response, payload) {

			if (response.statusCode === 200) {
				options.result.credentials.username = JSON.parse(payload).user.login;
				log.info(
					"successfully authenticated '%s'",
					options.result.credentials.username
				);
			}
			else {
				log.warn("invalid token");
				throw failure("invalid token", TOKEN_SCHEME, options.configuration);
			}

			return options.result;
		});
	}

	plugin.auth.scheme("github-basic", function (server, config) {
		// The cache helps keep from flooding GitHub with auth requests.
		var cache  = createCache();

		var schema = Joi.object().keys({
			application : Joi.object().keys({
				clientId     : Joi.string().required(),
				clientSecret : Joi.string().required(),
				note         : Joi.string().required(),
				scopes       : Joi.array().required(),
				url          : Joi.string().required()
			}),

			organization : Joi.string().optional(),
			realm        : Joi.string().optional()
		});

		config = config || Object.create(null);
		Joi.assert(config, schema);

		return {
			authenticate : function (request, reply) {
				var cached = cache.get(request.headers.authorization);

				var options = {
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
					reply(failure("forbidden", BASIC_SCHEME, config), result);
					return;
				}

				log.info(
					"attempting to authenticate '%s'",
					result.credentials.username
				);

				if (cached) {
					log.info("returning cached auth data for '%s'", result.credentials.username);
					reply(null, cached);
					return;
				}

				basicLogin(config, options, result)
				.then(function (result) {
					if (config.organization) {
						var options = {
							authorization : request.headers.authorization,
							result        : result,
							scheme        : BASIC_SCHEME
						};
						_.defaults(options, config);

						return checkOrganization(options);
					}

					return result;
				})
				.then(function (result) {
					if (config.application) {
						return getToken(config, options, result);
					}

					return result;
				})
				.then(
					function (result) {
						cache.set(request.headers.authorization, result);
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
		// The cache helps keep from flooding GitHub with auth requests.
		var cache  = createCache();

		var schema = Joi.object().keys({
			clientId     : Joi.string().required(),
			clientSecret : Joi.string().required(),
			organization : Joi.string().optional(),
			realm        : Joi.string().optional()
		});

		var authorization;

		Joi.assert(config, schema);

		authorization = BASIC_SCHEME + " " +
			(new Buffer(config.clientId + ":" + config.clientSecret)).toString("base64");

		return {
			authenticate : function (request, reply) {
				var cached      = cache.get(request.headers.authorization);
				var credentials = parseCredentials(request);

				var options = {
					headers : {
						authorization : authorization
					}
				};

				var result = {
					credentials : {}
				};

				if (!credentials.token) {
					log.warn("no token supplied with the request");
					reply(failure("forbidden", TOKEN_SCHEME, config), result);
					return;
				}

				if (cached) {
					reply(null, cached);
					return;
				}

				var tokenUrl = url.resolve(
					GITHUB_API,
					"/applications/" + config.clientId + "/tokens/" + credentials.token
				);

				tokenLogin({
					configuration : config,
					request       : options,
					result        : result,
					url           : tokenUrl
				})
				.then(function (result) {
					if (config.organization) {
						var options = {
							authorization : basicAuth(credentials.token, "x-oauth-basic"),
							result        : result,
							scheme        : TOKEN_SCHEME
						};
						_.defaults(options, config);

						return checkOrganization(options);
					}

					return result;
				})
				.then(
					function (result) {
						cache.set(request.headers.authorization, result);
						reply(null, result);
					},
					function (error) {
						reply(error, result);
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
