"use strict";
var fs     = require("fs");
var Hapi   = require("hapi");
var Nipple = require("nipple");
var path   = require("path");
var Q      = require("q");
var url    = require("url");
var _      = require("lodash");

var GITHUB_API  = "https://api.github.com";
var GITHUB_USER = url.resolve(GITHUB_API, "/user");

function version () {
	var meta = JSON.parse(
		fs.readFileSync(path.join(__dirname, "..", "package.json"))
	);

	return meta.version;
}

exports.register = function (plugin, options, done) {

	function parseCredentials (request) {
		var credentials = Object.create(null);
		var parts       = request.headers.authorization.split(" ");
		var token;

		if (parts[0].toLowerCase() === "basic") {
			token = (new Buffer(parts[1], "base64")).toString();
			token = token.split(":");

			credentials.username = token[0];
			credentials.password = token[1];
		}

		return credentials;
	}

	plugin.auth.scheme("github-basic", function () {
		return {
			authenticate : function (request, reply) {
				var options     = {
					headers : {
						authorization : request.headers.authorization
					}
				};
				var result = {
					credentials : _.pick(parseCredentials(request), "username")
				};

				Q.ninvoke(Nipple, "get", GITHUB_USER, options)
				.spread(function (response, payload) {
					var error  = null;

					if (response.statusCode === 200) {
						result.credentials.username = JSON.parse(payload).login;
					}
					else {
						error = Hapi.error.unauthorized("forbidden");
					}

					reply(error, result);
				})
				.fail(function (error) {
					reply(
						Hapi.error.internal("failed to authenticate", error),
						result
					);
				})
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
