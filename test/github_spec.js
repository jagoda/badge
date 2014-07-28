"use strict";
var Hapi   = require("hapi");
var Lab    = require("lab");
var Nipple = require("nipple");
var nock   = require("nock");
var plugin = require("..");
var sinon  = require("sinon");
var _      = require("lodash");

var after      = Lab.after;
var before     = Lab.before;
var describe   = Lab.describe;
var expect     = Lab.expect;
var it         = Lab.it;

var GITHUB_API   = "https://api.github.com";
var LOGIN        = "octocat";
var OAUTH        = "x-oauth-basic";
var ORGANIZATION = "octocats";
var PASSWORD     = "password";
var TOKEN        = "token";
var USERNAME     = "testy";

var CLIENT_ID     = "id";
var CLIENT_SECRET = "secret";
var NOTE          = "an app";
var SCOPES        = [ "a scope" ];
var URL           = "http://example.com";

function basicAuth (username, password) {
	return "Basic " +
		(new Buffer(username + ":" + password)).toString("base64");
}

describe("The GitHub basic auth scheme", function () {

	function authenticate (server, callback) {
		server.inject(
			{
				headers : {
					authorization : basicAuth(USERNAME, PASSWORD)
				},

				method : "GET",
				url    : "/"
			},
			callback
		);
	}

	function userRequest () {
		return nock(GITHUB_API)
		.matchHeader("Authorization", basicAuth(USERNAME, PASSWORD))
		.get("/user");
	}

	before(function (done) {
		nock.disableNetConnect();
		done();
	});

	after(function (done) {
		nock.enableNetConnect();
		done();
	});

	describe("using the default configuration", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {
				server.auth.strategy("default", "github-basic");
				server.route(
					{
						config : {
							auth : {
								mode    : "try",
								strategy : "default"
							}
						},

						handler : function (request, reply) {
							reply(request.auth);
						},

						method : "GET",
						path   : "/"
					}
				);
				done(error);
			});
		});

		describe("with valid credentials", function () {
			var request;
			var response;

			before(function (done) {
				request = userRequest().reply(200, { login : LOGIN });
				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies the credentials with GitHub", function (done) {
				expect(request.isDone(), "no request to GitHub").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "not permitted")
				.to.be.true;

				done();
			});
		});

		describe("with invalid credentials", function () {
			var request;
			var response;

			before(function (done) {
				request = userRequest().reply(401);
				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			it("verifies the credentials with GitHub", function (done) {
				expect(request.isDone(), "no GitHub request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", USERNAME);

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("failing to contact GitHub", function () {
			var response;
			var getStub;

			before(function (done) {
				getStub = sinon.stub(
					Nipple, "get",
					function (uri, options, callback) {
						callback(new Error("boom!"));
					}
				);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				getStub.restore();
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", USERNAME);

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("without a basic credential", function () {
			var response;

			before(function (done) {
				server.inject(
					{
						method : "GET",
						url    : "/"
					},
					function (_response_) {
						response = _response_;
						done();
					}
				);
			});

			it("does not return a username", function (done) {
				expect(response.result.credentials.username, "username")
				.not.to.exist;

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});
	});

	describe("configured with client credentials", function () {
		var server;

		function tokenRequest () {
			return nock(GITHUB_API)
			.matchHeader("Authorization", basicAuth(USERNAME, PASSWORD))
			.put(
				"/authorizations/clients/" + CLIENT_ID,
				/* jshint -W106 */
				{
					client_secret : CLIENT_SECRET,
					note          : NOTE,
					note_url      : URL,
					scopes        : SCOPES
				}
				/* jshint +W106 */
			);
		}

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {

				server.auth.strategy("generate-token", "github-basic", {
					clientId     : CLIENT_ID,
					clientSecret : CLIENT_SECRET,
					note         : NOTE,
					scopes       : SCOPES,
					url          : URL
				});

				server.route({
					config : {
						auth : {
							mode     : "try",
							strategy : "generate-token"
						}
					},

					handler : function (request, reply) {
						reply(request.auth);
					},

					method : "GET",
					path   : "/"
				});

				done(error);
			});
		});

		describe("with valid credentials", function () {
			var response;
			var tokenNock;
			var userNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(200, { token : TOKEN });
				userNock  = userRequest().reply(200, { login : LOGIN });

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies the request with GitHub", function (done) {
				expect(userNock.isDone(), "no user request").to.be.true;
				expect(tokenNock.isDone(), "no token request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("returns an API token", function (done) {
				expect(response.result.artifacts, "no token")
				.to.have.property("token", TOKEN);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "not permitted")
				.to.be.true;

				done();
			});
		});

		describe("with invalid credentials", function () {
			var response;
			var userNock;

			before(function (done) {
				userNock  = userRequest().reply(401);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies the credentials with GitHub", function (done) {
				expect(userNock.isDone(), "no GitHub request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", USERNAME);

				done();
			});

			it("does not return and API token", function (done) {
				expect(response.result.artifacts, "found token")
				.not.to.have.property("token");
				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("failing to retrieve a token", function () {
			var response;
			var tokenNock;
			var userNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(500);
				userNock  = userRequest().reply(200, { login : LOGIN });

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies the request with GitHub", function (done) {
				expect(userNock.isDone(), "no user request").to.be.true;
				expect(tokenNock.isDone(), "no token request").to.be.true;
				done();
			});

			it("does not return and API token", function (done) {
				expect(response.result.artifacts, "found token")
				.not.to.have.property("token");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});
	});

	describe("configuration", function () {
		var configuration = {
			clientId     : CLIENT_ID,
			clientSecret : CLIENT_SECRET,
			note         : NOTE,
			scopes       : SCOPES,
			url          : URL
		};

		function testConfiguration (key, done) {
			var server  = new Hapi.Server();
			var options = _.clone(configuration);

			server.pack.register(plugin, function () {
				delete options[key];

				expect(function () {
					server.auth.strategy("error", "github-basic", options);
				}).to.throw(new RegExp(key, "i"));

				done();
			});
		}

		it("requires a client ID", function (done) {
			testConfiguration("clientId", done);
		});

		it("requires a client secret", function (done) {
			testConfiguration("clientSecret", done);
		});

		it("requires a note", function (done) {
			testConfiguration("note", done);
		});

		it("requires a scope list", function (done) {
			testConfiguration("scopes", done);
		});

		it("requires a URL", function (done) {
			testConfiguration("url", done);
		});
	});
});

describe("The GitHub token auth scheme", function () {

	function authenticate (server, done) {
		server.inject(
			{
				headers : {
					authorization : "token " + TOKEN
				},

				method : "GET",
				url    : "/"
			},
			done
		);
	}

	function tokenRequest () {
		return nock(GITHUB_API)
		.matchHeader("Authorization", basicAuth(CLIENT_ID, CLIENT_SECRET))
		.get("/applications/" + CLIENT_ID + "/tokens/" + TOKEN);
	}

	before(function (done) {
		nock.disableNetConnect();
		done();
	});

	after(function (done) {
		nock.enableNetConnect();
		done();
	});

	describe("using the basic configuration", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {
				server.auth.strategy("token-basic", "github-token", {
					clientId     : CLIENT_ID,
					clientSecret : CLIENT_SECRET
				});

				server.route(
					{
						config : {
							auth : {
								mode     : "try",
								strategy : "token-basic"
							}
						},

						handler : function (request, reply) {
							reply(request.auth);
						},

						method : "GET",
						path   : "/"
					}
				);

				done(error);
			});
		});

		describe("with a valid token", function () {
			var response;
			var tokenNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(
					200,
					{
						token : TOKEN,
						user  : {
							login : LOGIN
						}
					}
				);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			it("verifies the token with GitHub", function (done) {
				expect(tokenNock.isDone(), "no GitHub request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "not permitted")
				.to.be.true;

				done();
			});
		});

		describe("with an invalid token", function () {
			var response;
			var tokenNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(404);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			it("verifies the token with GitHub", function (done) {
				expect(tokenNock.isDone(), "no GitHub request").to.be.true;
				done();
			});

			it("does not return the username", function (done) {
				expect(response.result.credentials, "found username")
				.not.to.have.property("username");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("failing to contact GitHub", function () {
			var getStub;
			var response;

			before(function (done) {
				getStub = sinon.stub(
					Nipple, "get",
					function (uri, options, callback) {
						callback(new Error("boom!"));
					}
				);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				getStub.restore();
				done();
			});

			it("verifies the request with GitHub", function (done) {
				expect(getStub.calledOnce, "no GitHub request").to.be.true;
				done();
			});

			it("does not return the username", function (done) {
				expect(response.result.credentials, "found username")
				.not.to.have.property("username");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("without a token", function () {
			var response;

			before(function (done) {
				server.inject(
					{
						method : "GET",
						url    : "/"
					},
					function (_response_) {
						response = _response_;
						done();
					}
				);
			});

			it("does not return the username", function (done) {
				expect(response.result.credentials, "found username")
				.not.to.have.property("username");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});
	});

	describe("configured with an organization", function () {
		var server;

		function orgRequest () {
			return nock(GITHUB_API)
			.matchHeader("Authorization", basicAuth(TOKEN, OAUTH))
			.get("/orgs/" + ORGANIZATION + "/members/" + LOGIN);
		}

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {
				server.auth.strategy("token-org", "github-token", {
					clientId     : CLIENT_ID,
					clientSecret : CLIENT_SECRET,
					organization : ORGANIZATION
				});

				server.route(
					{
						config : {
							auth : {
								mode     : "try",
								strategy : "token-org"
							}
						},

						handler : function (request, reply) {
							reply(request.auth);
						},

						method : "GET",
						path   : "/"
					}
				);

				done(error);
			});
		});

		describe("with a token belonging to the organization", function () {
			var orgNock;
			var response;
			var tokenNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(
					200,
					{
						token : TOKEN,
						user  : {
							login : LOGIN
						}
					}
				);

				orgNock = orgRequest().reply(204);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			it("verifies organization membership with GitHub", function (done) {
				expect(tokenNock.isDone(), "no token request").to.be.true;
				expect(orgNock.isDone(), "no org request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username");

				done();
			});

			it("returns the organization", function (done) {
				expect(response.result.credentials, "no organization")
				.to.have.property("organization", ORGANIZATION);

				done();
			});

			it("permits the requets", function (done) {
				expect(response.result.isAuthenticated, "prohibitted")
				.to.be.true;

				done();
			});
		});

		describe("with a token not belonging to the organization", function () {
			var orgNock;
			var response;
			var tokenNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(
					200,
					{
						token : TOKEN,
						user  : {
							login : LOGIN
						}
					}
				);

				orgNock = orgRequest().reply(404);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			it("verifies organization membership with GitHub", function (done) {
				expect(tokenNock.isDone(), "no token request").to.be.true;
				expect(orgNock.isDone(), "no org request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("does not return the organization", function (done) {
				expect(response.result.credentials, "found organization")
				.not.to.have.property("organization");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});
	});

	describe("configuration", function () {
		it("must be provided");

		it("requires a client ID");

		it("requires a client secret");
	});
});
