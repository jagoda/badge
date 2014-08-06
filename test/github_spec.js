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

var BASIC_SCHEME = "Basic";
var CHALLENGE    = "WWW-Authenticate";
var REALM        = "a realm";
var TOKEN_SCHEME = "token";

function basicAuth (username, password) {
	return BASIC_SCHEME + " " +
		(new Buffer(username + ":" + password)).toString("base64");
}

function createTestRoute (server, strategy) {
	server.route(
		{
			config : {
				auth : {
					mode    : "try",
					strategy : strategy
				}
			},

			handler : function (request, reply) {
				reply(request.auth);
			},

			method : "GET",
			path   : "/"
		}
	);
}

describe("The GitHub basic auth scheme", function () {

	function assertChallenge (response) {
		expect(response.result.error, "no error").to.be.an.instanceOf(Error);

		expect(response.result.error.output.headers, "challenge")
		.to.have.property(CHALLENGE);

		expect(response.result.error.output.headers[CHALLENGE], "challenge scheme")
		.to.contain(BASIC_SCHEME);

		expect(response.result.error.output.headers[CHALLENGE], "realm")
		.not.to.contain("realm=");
	}

	function assertNoChallenge (response) {
		expect(response.result.error, "challeng").not.to.exist;
	}

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

	function orgRequest () {
		return nock(GITHUB_API)
		.matchHeader("Authorization", basicAuth(USERNAME, PASSWORD))
		.get("/orgs/" + ORGANIZATION + "/members/" + LOGIN);
	}

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
				createTestRoute(server, "default");
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

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
				done();
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

	describe("configured with application credentials", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {

				server.auth.strategy("generate-token", "github-basic", {
					application : {
						clientId     : CLIENT_ID,
						clientSecret : CLIENT_SECRET,
						note         : NOTE,
						scopes       : SCOPES,
						url          : URL
					}
				});

				createTestRoute(server, "generate-token");
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

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
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

	describe("configured with an organization", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {

				server.auth.strategy("basic-org", "github-basic", {
					organization : ORGANIZATION
				});

				createTestRoute(server, "basic-org");
				done(error);
			});
		});

		describe("given credentials for a member of the organization", function () {
			var orgNock;
			var response;
			var userNock;

			before(function (done) {
				userNock = userRequest().reply(200, { login : LOGIN });
				orgNock  = orgRequest().reply(204);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies organization membership with GitHub", function (done) {
				expect(userNock.isDone(), "authentication request").to.be.true;
				expect(orgNock.isDone(), "membership request").to.be.true;
				done();
			});

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("returns the organization", function (done) {
				expect(response.result.credentials, "no organization")
				.to.have.property("organization", ORGANIZATION);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "prohibitted").to.be.true;
				done();
			});
		});

		describe("given credentials for a non-member", function () {
			var orgNock;
			var response;
			var userNock;

			before(function (done) {
				userNock = userRequest().reply(200, { login : LOGIN });
				orgNock  = orgRequest().reply(404);

				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies membership with GitHub", function (done) {
				expect(userNock.isDone(), "authentication request").to.be.true;
				expect(orgNock.isDone(), "membership request").to.be.true;
				done();
			});

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("does not return the organization", function (done) {
				expect(response.result.credentials, "organization")
				.not.to.have.property("organization");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted").to.be.false;
				done();
			});
		});
	});

	describe("configured with application credentials and an organization", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {

				server.auth.strategy("client-org", "github-basic", {
					application : {
						clientId     : CLIENT_ID,
						clientSecret : CLIENT_SECRET,
						note         : NOTE,
						scopes       : SCOPES,
						url          : URL
					},

					organization : ORGANIZATION
				});

				createTestRoute(server, "client-org");
				done(error);
			});
		});

		describe("given credentials for a member of the organization", function () {
			var orgNock;
			var response;
			var tokenNock;
			var userNock;

			before(function (done) {
				orgNock   = orgRequest().reply(204);
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

			it("verifies membership with GitHub", function (done) {
				expect(userNock.isDone(), "authentication request").to.be.true;
				expect(orgNock.isDone(), "membership request").to.be.true;
				done();
			});

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
				done();
			});

			it("requests a token", function (done) {
				expect(tokenNock.isDone(), "token request").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("returns the organization", function (done) {
				expect(response.result.credentials, "no organization")
				.to.have.property("organization", ORGANIZATION);

				done();
			});

			it("returns a token", function (done) {
				expect(response.result.artifacts, "no token")
				.to.have.property("token", TOKEN);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "prohibitted").to.be.true;
				done();
			});
		});

		describe("given credentials for a non-member", function () {
			var orgNock;
			var response;
			var tokenNock;
			var userNock;

			before(function (done) {
				orgNock   = orgRequest().reply(404);
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

			it("verifies membership with GitHub", function (done) {
				expect(userNock.isDone(), "authentication request").to.be.true;
				expect(orgNock.isDone(), "membership request").to.be.true;
				done();
			});

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
				done();
			});

			it("does not request a token", function (done) {
				expect(tokenNock.isDone(), "token request").to.be.false;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("does not return the organization", function (done) {
				expect(response.result.credentials, "organization")
				.not.to.have.property("organization");

				done();
			});

			it("does not return a token", function (done) {
				expect(response.result.artifacts, "token")
				.not.to.have.property("token");

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted").to.be.false;
				done();
			});
		});
	});

	describe("configured with a realm", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {

				server.auth.strategy("basic-realm", "github-basic", {
					realm : REALM
				});

				createTestRoute(server, "basic-realm");
				done(error);
			});
		});

		describe("failing to authenticate a user", function () {
			var response;
			var userNock;

			before(function (done) {
				userNock = userRequest().reply(401);
				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("includes a realm in the authentication challenge", function (done) {
				expect(response.result.error, "no error").to.be.an.instanceOf(Error);

				expect(response.result.error.output.headers, "challenge")
				.to.have.property(CHALLENGE);

				expect(response.result.error.output.headers[CHALLENGE], "no realm")
				.to.contain("realm=\"" + REALM +"\"");

				done();
			});
		});
	});

	describe("configuration", function () {

		it("cannot have an unsupported option", function (done) {
			var server = new Hapi.Server();

			server.pack.register(plugin, function () {

				expect(function () {
					server.auth.strategy("error", "github-basic", { foo : "bar" });
				}).to.throw(/not allowed/i);

				done();
			});
		});
	});

	describe("application configuration", function () {
		var configuration = {
			clientId     : CLIENT_ID,
			clientSecret : CLIENT_SECRET,
			note         : NOTE,
			scopes       : SCOPES,
			url          : URL
		};

		function testConfiguration (configuration, key, done) {
			var server  = new Hapi.Server();

			var options = {
				application : _.clone(configuration)
			};

			server.pack.register(plugin, function () {
				delete options.application[key];

				expect(function () {
					server.auth.strategy("error", "github-basic", options);
				}).to.throw(new RegExp(key, "i"));

				done();
			});
		}

		it("requires a client ID", function (done) {
			testConfiguration(configuration, "clientId", done);
		});

		it("requires a client secret", function (done) {
			testConfiguration(configuration, "clientSecret", done);
		});

		it("requires a note", function (done) {
			testConfiguration(configuration, "note", done);
		});

		it("requires a scope list", function (done) {
			testConfiguration(configuration, "scopes", done);
		});

		it("requires a URL", function (done) {
			testConfiguration(configuration, "url", done);
		});
	});
});

describe("The GitHub token auth scheme", function () {

	function assertChallenge (response) {
		expect(response.result.error, "no error").to.be.an.instanceOf(Error);

		expect(response.result.error.output.headers, "challenge")
		.to.have.property(CHALLENGE);

		expect(response.result.error.output.headers[CHALLENGE], "challeng scheme")
		.to.contain(TOKEN_SCHEME);

		expect(response.result.error.output.headers[CHALLENGE], "realm")
		.not.to.contain("realm=");
	}

	function assertNoChallenge (response) {
		expect(response.result.error, "challenge").not.to.exist;
	}

	function authenticate (server, done) {
		server.inject(
			{
				headers : {
					authorization : TOKEN_SCHEME + " " + TOKEN
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

				createTestRoute(server, "token-basic");
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

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
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
			var github;
			var response;

			before(function (done) {
				// Catch-all for unexpected GET requests.
				github = nock(GITHUB_API)
				.filteringPath(/.*/, "/")
				.get("/")
				.reply(200);

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

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("does not contact GitHub", function (done) {
				expect(github.isDone(), "GitHub request").to.be.false;
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
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

				createTestRoute(server, "token-org");
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

			it("does not present an authentication challenge", function (done) {
				assertNoChallenge(response);
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

			it("presents an authentication challenge", function (done) {
				assertChallenge(response);
				done();
			});
		});
	});

	describe("configured with a realm", function () {
		var server;

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function () {
				server.auth.strategy("token-realm", "github-token", {
					clientId     : CLIENT_ID,
					clientSecret : CLIENT_SECRET,
					realm        : REALM
				});

				createTestRoute(server, "token-realm");
				done();
			});
		});

		describe("failing to validate a token", function () {
			var response;
			var tokenNock;

			before(function (done) {
				tokenNock = tokenRequest().reply(404);
				authenticate(server, function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("includes a realm with the authentication challenge", function (done) {
				expect(response.result.error, "no error").to.be.an.instanceOf(Error);

				expect(response.result.error.output.headers, "no challenge")
				.to.have.property(CHALLENGE);

				expect(response.result.error.output.headers[CHALLENGE], "realm")
				.to.contain("realm=\"" + REALM + "\"");

				done();
			});
		});
	});

	describe("configuration", function () {
		function testConfiguration (config, pattern, done) {
			var server = new Hapi.Server();
			server.pack.register(plugin, function (error) {
				expect(function () {
					server.auth.strategy("config", "github-token", config);
				}).to.throw(pattern);

				done(error);
			});
		}

		it("must be provided", function (done) {
			testConfiguration(undefined, /missing/i, done);
		});

		it("requires a client ID", function (done) {
			testConfiguration({ clientSecret : CLIENT_SECRET }, /clientId/i, done);
		});

		it("requires a client secret", function (done) {
			testConfiguration({ clientId : CLIENT_ID }, /clientSecret/i, done);
		});

		it("does not allow unknown options", function (done) {
			var configuration = {
				clientId     : CLIENT_ID,
				clientSecret : CLIENT_SECRET,
				foo          : "bar"
			};

			testConfiguration(configuration, /not allowed/i, done);
		});
	});
});
